import { GoogleGenerativeAI } from "@google/generative-ai";
import { Document } from "@langchain/core/documents";
import { config } from "dotenv";
// Load environment variables from .env file
config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

export const aiSummariseCommit = async (diff: string) => {
  // https://github.com/docker/genai-stack/commit/<commitHash>.diff
  const response = await model.generateContent([
    `
You are an expert software engineer and commit summarizer.

You will be given a raw Git diff of a commit. Your task is to summarize the changes in plain, concise English. Focus on **what was changed and why**, not how the code looks.

Some reminders about the Git diff format:

For every file, there are a few metadata lines, like (for example):

\`\`\`
diff --git a/lib/index.js b/lib/index.js
index a0df691..bfef603 100644
--- a/lib/index.js
+++ b/lib/index.js
\`\`\`

This means that \`lib/index.js\` was modified in this commit. Note that this is only an example.

Then there is a specifier of the lines that were modified.
- A line starting with \`+\` means it was **added**.
- A line starting with \`-\` means that line was **deleted**.
- A line that starts with neither \`+\` nor \`-\` is code given for context and better understanding. It is not part of the diff.

[...more lines may follow in a real diff...]

---

EXAMPLE SUMMARY COMMENTS:
- Raised the amount of returned recordings from \`10\` to \`100\`
- Fixed a typo in the GitHub action name
- Moved the \`octokit\` initialization to a separate file
- Added an OpenAI API for completions
- Lowered numeric tolerance for test files

Most commits will have **fewer comments** than this examples list.
The last comment does not include the file names.
Do not include parts of the example in your summary.

It is given only as an example of **appropriate comments**.

---

Please summarise the following diff file:

\`\`\`diff
${diff}
\`\`\`
`,
  ]);

  return response.response.text();
};

export async function summariseCode(doc: Document) {
  console.log("Getting summary for", doc.metadata.source);
  try {
    const code = doc.pageContent.slice(0, 10000); // Limit to 10k characters
  
    // Check if code content is empty
    if (!code || code.trim().length === 0) {
      return `This is a ${doc.metadata.source} file with no readable content.`;
    }

    const prompt = `
  You are an intelligent senior software engineer who specializes in onboarding new developers to a codebase.
  You are onboarding a junior software engineer and explaining to them the purpose of the file: ${doc.metadata.source}.
  
  Here is the code:
  \`\`\`
  ${code}
  \`\`\`
  
  Give a concise summary of the code above, explaining its purpose and functionality in no more than 100 words.
  `;
  
    const response = await model.generateContent([prompt]);
    const summary = response.response.text();
    
    // Ensure we return a valid summary
    return summary && summary.trim().length > 0 
      ? summary 
      : `This is a ${doc.metadata.source} file containing code that could not be summarized.`;
      
  } catch (error) {
    console.error("Error summarizing code:", error);
    return `This is a ${doc.metadata.source} file that encountered an error during summarization.`;
  }
}


export async function generateEmbeddingFromGemini(summary: string) {
  // Validate input
  if (!summary || summary.trim().length === 0) {
    throw new Error("Summary text cannot be empty for embedding generation");
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-embedding-001"
  })
  
  const result = await model.embedContent(summary.trim())
  const embedding = result.embedding
  return embedding.values
}

/**
 * Rate limiter for Gemini API calls
 * Free tier limits for gemini-embedding-001:
 * - Requests Per Minute (RPM): 100
 * - Tokens Per Minute (TPM): 30,000
 * - Requests Per Day (RPD): 1,000
 * 
 * We'll use 90 RPM to be safe (~1.5 requests per second)
 */
const REQUESTS_PER_MINUTE = 90; // Safety margin below 100 RPM limit
const DELAY_BETWEEN_REQUESTS = 60000 / REQUESTS_PER_MINUTE; // ~667ms

/**
 * Helper to delay execution
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface EmbeddingProgress {
  processed: number;
  total: number;
  currentFile: string;
  estimatedTimeRemaining: number; // in seconds
}

/**
 * Generate embeddings in batches with rate limiting and progress tracking
 */
export async function generateEmbeddingsInBatches(
  summaries: Array<{ text: string; fileName: string }>,
  onProgress?: (progress: EmbeddingProgress) => void
): Promise<Array<{ embedding: number[]; fileName: string; summary: string }>> {
  const results: Array<{ embedding: number[]; fileName: string; summary: string }> = [];
  const totalItems = summaries.length;
  const startTime = Date.now();

  for (let i = 0; i < totalItems; i++) {
    const item = summaries[i];
    
    if (!item) continue; // Skip if item is undefined
    
    try {
      // Generate embedding
      const embedding = await generateEmbeddingFromGemini(item.text);
      results.push({
        embedding,
        fileName: item.fileName,
        summary: item.text
      });

      // Calculate progress metrics
      const processed = i + 1;
      const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
      const averageTimePerItem = elapsedTime / processed;
      const estimatedTimeRemaining = Math.ceil(averageTimePerItem * (totalItems - processed));

      // Report progress
      if (onProgress) {
        onProgress({
          processed,
          total: totalItems,
          currentFile: item.fileName,
          estimatedTimeRemaining
        });
      }

      // Rate limiting: delay before next request (except for the last one)
      if (i < totalItems - 1) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }

    } catch (error) {
      console.error(`Failed to generate embedding for ${item.fileName}:`, error);
      // Continue with next file instead of failing completely
      // You can choose to rethrow or handle differently based on requirements
    }
  }

  return results;
}

// console.log("Gemini API Key:", process.env.GEMINI_API_KEY);
// console.log(await generateEmbeddings("Hello world! This is a test summary for embedding generation."));