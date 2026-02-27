/**
 * Amazon Bedrock client — text generation (Claude) + embeddings (Titan)
 * P12: Embeddings via Titan Embed Text v1 → 1536 dimensions
 * P60: All text generation uses Amazon Bedrock Claude
 * P61: Unavailable Bedrock → exponential backoff + retry
 * P72: AWS throttling handled with retry logic
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type InvokeModelCommandInput,
} from "@aws-sdk/client-bedrock-runtime";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff (P61, P72)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 4;

async function withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const error = err as Error & { name?: string; $retryable?: { throttling: boolean } };

    const isThrottling =
      error.name === "ThrottlingException" ||
      error.name === "ServiceUnavailableException" ||
      error.$retryable?.throttling === true;

    if (isThrottling && attempt < MAX_RETRIES) {
      // Exponential backoff with jitter: 2^attempt * 1000ms ± 20%
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
      const delay = Math.round(baseDelay + jitter);
      console.warn(`[Bedrock] Throttled. Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      return withRetry(fn, attempt + 1);
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Text generation — Claude 3 (Sonnet or Haiku)
// ---------------------------------------------------------------------------

export type BedrockTextModel = "sonnet" | "haiku";

export interface BedrockTextOptions {
  model?: BedrockTextModel;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Generate text using Amazon Bedrock Claude.
 * P60: Text generation exclusively via Bedrock Claude.
 */
export async function generateText(
  prompt: string,
  options: BedrockTextOptions = {},
): Promise<string> {
  const { model = "sonnet", maxTokens = 4096, temperature = 0.5, systemPrompt } = options;

  const modelId =
    model === "haiku" ? env.AWS_BEDROCK_HAIKU_MODEL_ID : env.AWS_BEDROCK_TEXT_MODEL_ID;

  const body: Record<string, unknown> = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: prompt }],
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const input: InvokeModelCommandInput = {
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  };

  const response = await withRetry(() =>
    getClient().send(new InvokeModelCommand(input)),
  );

  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded) as {
    content: Array<{ type: string; text: string }>;
  };

  const text = parsed.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  if (!text) {
    throw new Error("[Bedrock] Empty response from Claude");
  }

  return text;
}

// ---------------------------------------------------------------------------
// Embedding generation — Titan Embed Text v1 (1536 dimensions)
// ---------------------------------------------------------------------------

/**
 * Generate a 1536-dimension embedding using Amazon Bedrock Titan.
 * P12: Always uses titan-embed-text-v1 → returns exactly 1536 floats.
 * P13: Returned vector stored in PostgreSQL pgvector column vector(1536).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("[Bedrock] Cannot embed empty text");
  }

  const input: InvokeModelCommandInput = {
    modelId: env.AWS_BEDROCK_EMBEDDING_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({ inputText: trimmed }),
  };

  const response = await withRetry(() =>
    getClient().send(new InvokeModelCommand(input)),
  );

  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded) as { embedding: number[] };

  if (!Array.isArray(parsed.embedding) || parsed.embedding.length !== 1536) {
    throw new Error(
      `[Bedrock] Unexpected embedding dimensions: ${parsed.embedding?.length ?? 0} (expected 1536)`,
    );
  }

  return parsed.embedding;
}

/**
 * Generate embeddings for multiple texts in batches, respecting Bedrock rate limits.
 * Returns embeddings in the same order as input texts.
 * P12, P13, P72
 */
export async function generateEmbeddingsInBatches(
  texts: string[],
  batchSize = 10,
  delayMs = 500,
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((text) => generateEmbedding(text)),
    );
    results.push(...batchResults);

    // Rate limiting delay between batches (P72)
    if (i + batchSize < texts.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
