'use server';

import { createStreamableValue } from 'ai/rsc'
import { generateEmbedding, streamGenerateText } from '@/lib/bedrock';
import { db } from '@/server/db';

export async function askQuestion(question: string, projectId: string) {
    const stream = createStreamableValue()

    const queryVector = await generateEmbedding(question)
    const vectorQuery = `[${queryVector.join(',')}]`

    const result = await db.$queryRaw`
    SELECT "fileName", "sourceCode", "summary",
    1 - ("embedding" <=> ${vectorQuery}::vector) AS similarity
    FROM "SourceCodeEmbedding"
    WHERE "projectId" = ${projectId}
    ORDER BY similarity DESC
    LIMIT 10
    ` as { fileName: string, sourceCode: string, summary: string }[];
    
    let context = ''

    for(const doc of result) {
        context += `source: ${doc.fileName}\n code context: ${doc.sourceCode}\n summary: ${doc.summary}\n\n`
    }

    const prompt = `
You are an AI code assistant who answers questions about the codebase. Your target audience is developers.

AI assistant is a brand new, powerful, human-like artificial intelligence.
The traits of AI include expert knowledge, helpfulness, cleverness, and articulateness.
AI is a well-behaved and well-mannered individual.
AI is always friendly, kind, and inspiring, and he is eager to provide vivid and thoughtful responses.
AI has the sum of all knowledge in their brain and is able to accurately answer nearly any question.

If the question is asking about code or a specific file, AI will provide the detailed answer, given the context.

START CONTEXT BLOCK
${context}
END OF CONTEXT BLOCK

START QUESTION
${question}
END OF QUESTION

AI assistant will take into account any CONTEXT BLOCK that is provided in a conversation.
If the context does not provide the answer to question, the AI assistant will say, "I'm sorry, but I do not have enough information to answer that."
AI assistant will not apologize for previous responses, but instead will indicate new information when available.
AI assistant will not invent anything that is not drawn directly from the context.

Answer in markdown syntax, with code snippets if needed. Be as detailed as possible when answering.
`;

    (async () => {
        try {
            for await (const delta of streamGenerateText(prompt, { model: 'sonnet', maxTokens: 2048 })) {
                stream.update(delta)
            }
        } finally {
            stream.done()
        }
    })()

    return {
        output: stream.value,
        filesReferences: result
    }
}
