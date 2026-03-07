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
  InvokeModelWithResponseStreamCommand,
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
// Circuit breaker (P61) — prevents cascading failures across Bedrock calls
// ---------------------------------------------------------------------------
// States: CLOSED (normal) → OPEN (fast-fail) → HALF_OPEN (probe) → CLOSED
//
// Shared via globalThis so all Next.js module instances share the same state.
// ---------------------------------------------------------------------------

const CB_FAILURE_THRESHOLD = 5;   // open after 5 consecutive failures
const CB_COOLDOWN_MS = 30_000;    // stay OPEN for 30 s before probing

declare const globalThis: typeof global & {
  __querynBedrockCircuitBreaker?: CircuitBreakerState;
};

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  openedAt: number; // ms timestamp
}

function getCB(): CircuitBreakerState {
  if (!globalThis.__querynBedrockCircuitBreaker) {
    globalThis.__querynBedrockCircuitBreaker = { state: 'CLOSED', failures: 0, openedAt: 0 };
  }
  return globalThis.__querynBedrockCircuitBreaker;
}

async function withCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
  const cb = getCB();

  if (cb.state === 'OPEN') {
    if (Date.now() - cb.openedAt >= CB_COOLDOWN_MS) {
      cb.state = 'HALF_OPEN';
      console.info('[Bedrock] Circuit half-open — probing...');
    } else {
      throw new Error('[Bedrock] Circuit OPEN — fast-failing to protect downstream services');
    }
  }

  try {
    const result = await fn();
    // Success → reset
    if (cb.state === 'HALF_OPEN') {
      console.info('[Bedrock] Circuit closed after successful probe');
    }
    cb.state = 'CLOSED';
    cb.failures = 0;
    return result;
  } catch (err) {
    cb.failures++;
    if (cb.failures >= CB_FAILURE_THRESHOLD) {
      cb.state = 'OPEN';
      cb.openedAt = Date.now();
      console.error(`[Bedrock] Circuit OPENED after ${cb.failures} consecutive failures`);
    }
    throw err;
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

  // Nova and Claude use different request/response formats
  const isNova = modelId.includes("nova");
  const isClaude = modelId.includes("claude");

  let body: Record<string, unknown>;

  if (isNova) {
    // Amazon Nova format
    body = {
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens, temperature },
    };
    if (systemPrompt) {
      body.system = [{ text: systemPrompt }];
    }
  } else if (isClaude) {
    // Anthropic Claude format
    body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    };
    if (systemPrompt) {
      body.system = systemPrompt;
    }
  } else {
    throw new Error(`[Bedrock] Unsupported model format for: ${modelId}`);
  }

  const input: InvokeModelCommandInput = {
    modelId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  };

  const response = await withCircuitBreaker(() =>
    withRetry(() => getClient().send(new InvokeModelCommand(input))),
  );

  const decoded = new TextDecoder().decode(response.body);

  let text = "";

  if (isNova) {
    const parsed = JSON.parse(decoded) as {
      output: { message: { content: Array<{ text: string }> } };
    };
    text = parsed.output.message.content.map((c) => c.text).join("");
  } else {
    const parsed = JSON.parse(decoded) as {
      content: Array<{ type: string; text: string }>;
    };
    text = parsed.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
  }

  if (!text) {
    throw new Error("[Bedrock] Empty response from model");
  }

  return text;
}

// ---------------------------------------------------------------------------
// Streaming text generation (for Q&A — real-time token streaming)
// ---------------------------------------------------------------------------

/**
 * Stream text generation token-by-token using Bedrock Nova or Claude.
 * Returns an async generator yielding text deltas.
 * P19, P60: Q&A answers stream in real-time from Bedrock.
 */
export async function* streamGenerateText(
  prompt: string,
  options: BedrockTextOptions = {},
): AsyncGenerator<string> {
  const { model = "sonnet", maxTokens = 4096, temperature = 0.5, systemPrompt } = options;

  const modelId =
    model === "haiku" ? env.AWS_BEDROCK_HAIKU_MODEL_ID : env.AWS_BEDROCK_TEXT_MODEL_ID;

  const isNova = modelId.includes("nova");

  let body: Record<string, unknown>;
  if (isNova) {
    body = {
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens, temperature },
    };
    if (systemPrompt) body.system = [{ text: systemPrompt }];
  } else {
    body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    };
    if (systemPrompt) body.system = systemPrompt;
  }

  const response = await withCircuitBreaker(() =>
    withRetry(() => getClient().send(
      new InvokeModelWithResponseStreamCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(body),
      })
    )),
  );

  if (!response.body) return;

  for await (const event of response.body) {
    const chunk = event.chunk?.bytes;
    if (!chunk) continue;
    const decoded = new TextDecoder().decode(chunk);
    try {
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      // Nova streaming format
      if (isNova) {
        const delta = (parsed as { contentBlockDelta?: { delta?: { text?: string } } })
          .contentBlockDelta?.delta?.text;
        if (delta) yield delta;
      } else {
        // Claude streaming format
        const delta = (parsed as { delta?: { type?: string; text?: string } }).delta;
        if (delta?.type === "content_block_delta" || delta?.text) {
          if (delta.text) yield delta.text;
        }
      }
    } catch {
      // skip malformed chunks
    }
  }
}

// ---------------------------------------------------------------------------
// Embedding generation — Titan Embed Text v1 (1536 dimensions)
// ---------------------------------------------------------------------------

/**
 * Generate a 1024-dimension embedding using Amazon Bedrock Titan Embed Text v2.
 * P12: Uses amazon.titan-embed-text-v2:0 → returns exactly 1024 floats.
 * P13: Returned vector stored in PostgreSQL pgvector column vector(1024).
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

  const response = await withCircuitBreaker(() =>
    withRetry(() => getClient().send(new InvokeModelCommand(input))),
  );

  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded) as { embedding: number[] };

  if (!Array.isArray(parsed.embedding) || parsed.embedding.length !== 1024) {
    throw new Error(
      `[Bedrock] Unexpected embedding dimensions: ${parsed.embedding?.length ?? 0} (expected 1024)`,
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
