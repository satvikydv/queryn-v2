import { NextResponse } from "next/server";
import { generateText, generateEmbedding } from "@/lib/bedrock";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test 1: Embedding (Titan)
  try {
    const embedding = await generateEmbedding("Hello from Queryn");
    results.embedding = {
      status: "ok",
      dimensions: embedding.length,
      sample: embedding.slice(0, 3),
    };
  } catch (err) {
    results.embedding = { status: "error", message: String(err) };
  }

  // Test 2: Text generation (Haiku — cheaper for testing)
  try {
    const text = await generateText("Reply with exactly: BEDROCK_OK", {
      model: "haiku",
      maxTokens: 20,
    });
    results.textGen = { status: "ok", response: text.trim() };
  } catch (err) {
    results.textGen = { status: "error", message: String(err) };
  }

  const allOk = Object.values(results).every(
    (r) => (r as { status: string }).status === "ok",
  );

  return NextResponse.json({ success: allOk, results }, { status: allOk ? 200 : 500 });
}
