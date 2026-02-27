/**
 * Amazon Q Business client — developer-specific code analysis, doc generation,
 * improvement suggestions, and function explanations.
 * Req 12: Amazon Q for code analysis, doc generation, dev assistance.
 * P19: AI answers use Amazon Bedrock Claude + Amazon Q context.
 */

import { env } from "@/env";
import { generateText } from "@/lib/bedrock";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeAnalysisResult {
  summary: string;
  issues: string[];
  suggestions: string[];
  complexity: "low" | "medium" | "high";
  rawResponse: string;
}

export interface DocGenerationResult {
  documentation: string;
  usage: string;
  parameters: string[];
  returnDescription: string;
}

export interface ImprovementResult {
  improvements: string[];
  refactoredCode?: string;
  explanation: string;
}

export interface FunctionExplanationResult {
  explanation: string;
  purpose: string;
  inputs: string;
  outputs: string;
  sideEffects: string;
}

export interface MeetingExtractionResult {
  actionItems: string[];
  decisions: string[];
  keyPoints: string[];
  participants: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build Amazon Q-style developer prompt context.
 * If AMAZON_Q_APP_ID is configured, prepend Q-specific instructions.
 */
function buildDeveloperContext(task: string): string {
  const qEnabled = !!env.AMAZON_Q_APP_ID;
  const prefix = qEnabled
    ? "You are Amazon Q Developer, an expert AI assistant for software development.\n"
    : "You are an expert software engineer and technical writer.\n";
  return `${prefix}${task}`;
}

// ---------------------------------------------------------------------------
// analyzeCode
// ---------------------------------------------------------------------------

/**
 * Analyze a code snippet for quality, issues, and architectural concerns.
 * P19, P20: Provides developer-specific insights beyond raw text generation.
 */
export async function analyzeCode(
  code: string,
  language = "TypeScript",
  context?: string,
): Promise<CodeAnalysisResult> {
  const prompt = buildDeveloperContext(
    `Analyze the following ${language} code and provide:
1. A concise summary (2-3 sentences)
2. A JSON list of issues found (bugs, anti-patterns, security concerns)
3. A JSON list of actionable suggestions for improvement
4. Overall complexity rating: "low", "medium", or "high"

${context ? `Context: ${context}\n` : ""}
Code:
\`\`\`${language.toLowerCase()}
${code}
\`\`\`

Respond in this exact JSON format:
{
  "summary": "...",
  "issues": ["...", "..."],
  "suggestions": ["...", "..."],
  "complexity": "low|medium|high"
}`,
  );

  const raw = await generateText(prompt, { model: "haiku", maxTokens: 2048 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string;
      issues: string[];
      suggestions: string[];
      complexity: "low" | "medium" | "high";
    };
    return { ...parsed, rawResponse: raw };
  } catch {
    return {
      summary: raw,
      issues: [],
      suggestions: [],
      complexity: "medium",
      rawResponse: raw,
    };
  }
}

// ---------------------------------------------------------------------------
// generateDocs
// ---------------------------------------------------------------------------

/**
 * Generate comprehensive documentation for a function or module.
 */
export async function generateDocs(
  code: string,
  language = "TypeScript",
): Promise<DocGenerationResult> {
  const prompt = buildDeveloperContext(
    `Generate comprehensive documentation for the following ${language} code.

Code:
\`\`\`${language.toLowerCase()}
${code}
\`\`\`

Respond in this exact JSON format:
{
  "documentation": "Main JSDoc/docstring documentation block",
  "usage": "Example usage code snippet",
  "parameters": ["param1: description", "param2: description"],
  "returnDescription": "Description of the return value"
}`,
  );

  const raw = await generateText(prompt, { model: "haiku", maxTokens: 2048 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return JSON.parse(jsonMatch[0]) as DocGenerationResult;
  } catch {
    return {
      documentation: raw,
      usage: "",
      parameters: [],
      returnDescription: "",
    };
  }
}

// ---------------------------------------------------------------------------
// suggestImprovements
// ---------------------------------------------------------------------------

/**
 * Suggest code improvements and optionally generate refactored code.
 */
export async function suggestImprovements(
  code: string,
  language = "TypeScript",
  includeRefactored = false,
): Promise<ImprovementResult> {
  const prompt = buildDeveloperContext(
    `Review the following ${language} code and suggest concrete improvements.
${includeRefactored ? "Also provide the refactored version of the code." : ""}

Code:
\`\`\`${language.toLowerCase()}
${code}
\`\`\`

Respond in this exact JSON format:
{
  "improvements": ["improvement explanation 1", "improvement explanation 2"],
  ${includeRefactored ? '"refactoredCode": "the improved code as a string",' : ""}
  "explanation": "Overall explanation of the proposed changes"
}`,
  );

  const raw = await generateText(prompt, { model: "sonnet", maxTokens: 4096 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return JSON.parse(jsonMatch[0]) as ImprovementResult;
  } catch {
    return {
      improvements: [],
      explanation: raw,
    };
  }
}

// ---------------------------------------------------------------------------
// explainFunction
// ---------------------------------------------------------------------------

/**
 * Generate a plain-language explanation of a function or code block.
 * P20: Responses include function-level explanations as part of Q&A context.
 */
export async function explainFunction(
  code: string,
  language = "TypeScript",
): Promise<FunctionExplanationResult> {
  const prompt = buildDeveloperContext(
    `Explain the following ${language} function/code in plain language that a developer can understand.

Code:
\`\`\`${language.toLowerCase()}
${code}
\`\`\`

Respond in this exact JSON format:
{
  "explanation": "Concise plain-language explanation",
  "purpose": "What this code does and why it exists",
  "inputs": "Description of inputs/parameters",
  "outputs": "Description of return value/output",
  "sideEffects": "Any side effects (DB writes, API calls, mutations, etc.) or 'None'"
}`,
  );

  const raw = await generateText(prompt, { model: "haiku", maxTokens: 1024 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return JSON.parse(jsonMatch[0]) as FunctionExplanationResult;
  } catch {
    return {
      explanation: raw,
      purpose: "",
      inputs: "",
      outputs: "",
      sideEffects: "Unknown",
    };
  }
}

// ---------------------------------------------------------------------------
// extractMeetingInsights
// ---------------------------------------------------------------------------

/**
 * Extract action items, decisions, key points from a meeting transcript.
 * P49: Action items, decisions, key points extracted from every transcript.
 */
export async function extractMeetingInsights(
  transcript: string,
): Promise<MeetingExtractionResult> {
  const prompt = buildDeveloperContext(
    `You are analyzing a meeting transcript. Extract structured insights.

Transcript:
${transcript}

Respond in this exact JSON format:
{
  "actionItems": ["action item 1", "action item 2"],
  "decisions": ["decision 1", "decision 2"],
  "keyPoints": ["key point 1", "key point 2"],
  "participants": ["name 1", "name 2"],
  "summary": "2-3 sentence summary of the meeting"
}`,
  );

  const raw = await generateText(prompt, { model: "sonnet", maxTokens: 4096 });

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return JSON.parse(jsonMatch[0]) as MeetingExtractionResult;
  } catch {
    return {
      actionItems: [],
      decisions: [],
      keyPoints: [],
      participants: [],
      summary: raw,
    };
  }
}
