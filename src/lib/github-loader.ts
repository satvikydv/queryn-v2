import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";
import { Document } from "@langchain/core/documents";
import { generateEmbeddingsInBatches, type EmbeddingProgress } from "./gemini";
import { batchSummariseCode } from "./groq";
import { db } from "@/server/db";
import { Octokit } from "octokit";
import { progressStore } from "./progress-store";

export const loadGithubRepo = async (
  githubUrl: string,
  githubToken?: string,
) => {
  const loader = new GithubRepoLoader(githubUrl, {
    accessToken: githubToken || "",
    branch: "main",
    ignoreFiles: [
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "README.md",
    ],
    recursive: true,
    unknown: "warn",
    maxConcurrency: 5,
  });
  const docs = await loader.load();
  return docs;
};

export const indexGithubRepo = async (
  projectId: string,
  githubUrl: string,
  githubToken?: string,
  onProgress?: (progress: EmbeddingProgress) => void
) => {
  const docs = await loadGithubRepo(githubUrl, githubToken);
  
  console.log(`Loaded ${docs.length} files from repository`);
  
  // Generate summaries with batch processing and rate limiting
  console.log('Generating summaries for all files with rate limiting...');
  const summaries = await batchSummariseCode(docs, (processed, total, currentFile) => {
    console.log(`Summarizing file ${processed}/${total}: ${currentFile}`);
    // Update progress store for UI
    progressStore.setProgress(projectId, {
      processed,
      total,
      currentFile,
      estimatedTimeRemaining: 0,
      status: 'in-progress',
      phase: 'summarizing'
    });
  });
  
  // Filter out failed summaries
  const validSummaries = summaries.filter((s): s is NonNullable<typeof s> => s !== null);
  console.log(`Successfully generated ${validSummaries.length} summaries`);
  
  // Generate embeddings in batches with rate limiting
  console.log('Starting batch embedding generation with rate limiting...');
  const embeddingResults = await generateEmbeddingsInBatches(
    validSummaries.map(s => ({ text: s.text, fileName: s.fileName })),
    onProgress
  );
  
  // Combine results with source code
  const allEmbeddings = embeddingResults.map((result) => {
    const summary = validSummaries.find(s => s.fileName === result.fileName);
    return {
      ...result,
      sourceCode: summary?.sourceCode || ''
    };
  });
  
  // Save to database
  console.log('Saving embeddings to database...');
  await Promise.allSettled(allEmbeddings.map(async (embedding, index) => {
    console.log(`Saving to DB: file ${index+1} of ${allEmbeddings.length}`);
    if(!embedding) return

    const sourceCodeEmbedding = await db.sourceCodeEmbedding.create({
        data: {
            projectId,
            fileName: embedding.fileName,
            summary: embedding.summary,
            sourceCode: embedding.sourceCode,
        },
    })

    // Update the embedding in the database
    await db.$executeRaw`
    UPDATE "SourceCodeEmbedding"
    SET "summaryEmbedding" = ${embedding.embedding}::vector
    WHERE "id" = ${sourceCodeEmbedding.id}
    `
  }))
  
  console.log('Indexing complete!');
};

const getFileCount = async(path: string, octokit: Octokit, githubOwner: string, githubRepo: string, acc: number = 0)=>{
  const { data } = await octokit.rest.repos.getContent({
    owner: githubOwner,
    repo: githubRepo,
    path
  })
  if(!Array.isArray(data) && data.type === 'file'){
    return acc + 1;   //accumulator + 1
  }
  if(Array.isArray(data)){
    let fileCount = 0
    const directories: string[] = []

    for(const item of data){
      if(item.type === 'dir'){
        directories.push(item.path)
      } else {
        fileCount++;
      }
    }

    if(directories.length > 0){
      const directoryCounts = await Promise.all(
        directories.map(dirPath => getFileCount(dirPath, octokit, githubOwner, githubRepo, 0))
      )
      fileCount += directoryCounts.reduce((acc, count) => acc + count, 0);
    }
    return acc + fileCount;
  }
  return acc
}

export const checkCredits = async (githubUrl: string, githubToken?: string) => {
  //find out how many files are in the repo
  const octokit = new Octokit({ auth: githubToken });
  const githubOwner = githubUrl.split("/")[3];
  const githubRepo = githubUrl.split("/")[4];
  if(!githubOwner || !githubRepo){
    return 0;
  }
  const fileCount = await getFileCount('', octokit, githubOwner, githubRepo);
  return fileCount
}