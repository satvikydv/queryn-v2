import Groq from "groq-sdk";
import { Document } from "@langchain/core/documents";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Rate limiter for Groq API calls
 * Free tier limits for meta-llama/llama-4-scout-17b-16e-instruct:
 * - Requests Per Minute (RPM): 30
 * - Requests Per Day (RPD): 1,000
 * - Tokens Per Minute (TPM): 30,000
 * - Tokens Per Day (TPD): 500,000
 * 
 * We'll use 25 RPM to be safe (~0.42 requests per second)
 */
const REQUESTS_PER_MINUTE = 25; // Safety margin below 30 RPM limit
const DELAY_BETWEEN_REQUESTS = 60000 / REQUESTS_PER_MINUTE; // ~2400ms

/**
 * Helper to delay execution
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const summariseCodeWithGroq = async (doc: Document) => {
  console.log("Getting summary for", doc.metadata.source);
  try {
    const code = doc.pageContent.slice(0, 10000); // Limit to 10k characters
  
    // Check if code content is empty
    if (!code || code.trim().length === 0) {
      return `This is a ${doc.metadata.source} file with no readable content.`;
    }

    const prompt = `You are an intelligent senior software engineer who specializes in onboarding new developers to a codebase.
You are onboarding a junior software engineer and explaining to them the purpose of the file: ${doc.metadata.source}.

Here is the code:
\`\`\`
${code}
\`\`\`

Give a concise summary of the code above, explaining its purpose and functionality in no more than 100 words.`;
  
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.4,
      max_tokens: 200,
    });

    const summary = chatCompletion.choices[0]?.message?.content || "";
    
    // Ensure we return a valid summary
    return summary && summary.trim().length > 0 
      ? summary 
      : `This is a ${doc.metadata.source} file containing code that could not be summarized.`;
      
  } catch (error) {
    console.error("Error summarizing code:", error);
    return `This is a ${doc.metadata.source} file that encountered an error during summarization.`;
  }
};

export const aiSummariseCommitWithGroq = async (diff: string) => {
  const prompt = `You are an expert software engineer and commit summarizer.

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
\`\`\``;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.3,
      max_tokens: 500,
    });

    return chatCompletion.choices[0]?.message?.content || "Error summarizing commit";
  } catch (error) {
    console.error("Error summarizing commit:", error);
    return "Error summarizing commit";
  }
};

/**
 * Batch process commit summaries with rate limiting
 */
export const batchSummariseCommits = async (
  diffs: Array<{ diff: string; commitHash: string }>,
  onProgress?: (processed: number, total: number) => void
): Promise<Array<{ commitHash: string; summary: string }>> => {
  const results: Array<{ commitHash: string; summary: string }> = [];
  const totalItems = diffs.length;

  for (let i = 0; i < totalItems; i++) {
    const item = diffs[i];
    
    if (!item) continue;
    
    try {
      const summary = await aiSummariseCommitWithGroq(item.diff);
      results.push({
        commitHash: item.commitHash,
        summary
      });

      // Report progress
      if (onProgress) {
        onProgress(i + 1, totalItems);
      }

      // Rate limiting: delay before next request (except for the last one)
      if (i < totalItems - 1) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }

    } catch (error) {
      console.error(`Failed to generate summary for commit ${item.commitHash}:`, error);
      results.push({
        commitHash: item.commitHash,
        summary: "Error summarizing commit"
      });
    }
  }

  return results;
};

/**
 * Batch process code file summaries with rate limiting
 */
export const batchSummariseCode = async (
  docs: Document[],
  onProgress?: (processed: number, total: number, currentFile: string) => void
): Promise<Array<{ text: string; fileName: string; sourceCode: string } | null>> => {
  const results: Array<{ text: string; fileName: string; sourceCode: string } | null> = [];
  const totalItems = docs.length;

  for (let i = 0; i < totalItems; i++) {
    const doc = docs[i];
    
    if (!doc) {
      results.push(null);
      continue;
    }
    
    try {
      const summary = await summariseCodeWithGroq(doc);
      results.push({
        text: summary,
        fileName: doc.metadata.source,
        sourceCode: doc.pageContent
      });

      // Report progress
      if (onProgress) {
        onProgress(i + 1, totalItems, doc.metadata.source);
      }

      // Rate limiting: delay before next request (except for the last one)
      if (i < totalItems - 1) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }

    } catch (error) {
      console.error(`Failed to summarize ${doc.metadata.source}:`, error);
      results.push(null);
    }
  }

  return results;
};
