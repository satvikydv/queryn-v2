import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";
import { generateText, generateEmbedding } from "./bedrock";
import { db } from "@/server/db";
import { Octokit } from "octokit";
import { progressStore } from "./progress-store";

export interface IndexProgress {
  processed: number;
  total: number;
  currentFile: string;
  estimatedTimeRemaining: number;
  status: "pending" | "in-progress" | "completed" | "error";
  phase?: "summarizing" | "embedding" | "commits";
  error?: string;
}

export const loadGithubRepo = async (
  githubUrl: string,
  githubToken?: string,
) => {
  const loader = new GithubRepoLoader(githubUrl, {
    accessToken: githubToken ?? "",
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
  return loader.load();
};

export const indexGithubRepo = async (
  projectId: string,
  githubUrl: string,
  githubToken?: string,
  onProgress?: (progress: IndexProgress) => void,
) => {
  const docs = await loadGithubRepo(githubUrl, githubToken);
  console.log(`[Bedrock] Loaded ${docs.length} files from repository`);

  const total = docs.length;
  let processed = 0;

  for (const doc of docs) {
    const fileName = doc.metadata?.source ?? "unknown";

    progressStore.setProgress(projectId, {
      processed,
      total,
      currentFile: fileName,
      estimatedTimeRemaining: 0,
      status: "in-progress",
      phase: "summarizing",
    });
    onProgress?.({ processed, total, currentFile: fileName, estimatedTimeRemaining: 0, status: "in-progress", phase: "summarizing" });

    try {
      // Incremental indexing: skip if file unchanged (P15)
      const existingIndex = await db.fileIndex.findUnique({
        where: { projectId_fileName: { projectId, fileName } },
        select: { sha: true },
      });
      const currentSha = (doc.metadata?.sha as string | undefined) ?? null;
      if (existingIndex && existingIndex.sha && existingIndex.sha === currentSha) {
        console.log(`[Bedrock] Skipping unchanged file: ${fileName}`);
        processed++;
        continue;
      }

      const sourceCode = doc.pageContent.slice(0, 8000); // Titan input limit

      // 1. Generate summary using Bedrock Nova Lite (fast + cheap) (P60)
      const summary = await generateText(
        `Summarize this code file concisely for a developer. Focus on: purpose, key functions/classes, dependencies, and notable patterns.\n\nFile: ${fileName}\n\n${sourceCode}`,
        { model: "haiku", maxTokens: 512, temperature: 0.2 },
      );

      // 2. Generate 1024-dim embedding using Bedrock Titan v2 (P12, P13)
      const embedding = await generateEmbedding(summary);

      // 3. Upsert into DB — handles both new files and re-indexed files (P15)
      const fileIndex = await db.fileIndex.upsert({
        where: { projectId_fileName: { projectId, fileName } },
        create: { projectId, fileName, sourceCode, summary, sha: currentSha },
        update: { sourceCode, summary, sha: currentSha },
      });

      // 4. Store vector embedding via raw SQL (Prisma Unsupported type)
      await db.$executeRaw`
        UPDATE "SourceCodeEmbedding"
        SET "embedding" = ${`[${embedding.join(",")}]`}::vector
        WHERE "id" = ${fileIndex.id}
      `;

      processed++;
      progressStore.setProgress(projectId, {
        processed,
        total,
        currentFile: fileName,
        estimatedTimeRemaining: 0,
        status: "in-progress",
        phase: "embedding",
      });
      onProgress?.({ processed, total, currentFile: fileName, estimatedTimeRemaining: 0, status: "in-progress", phase: "embedding" });
    } catch (err) {
      // P16: Log and skip — do not consume credits for failed files
      console.error(`[Bedrock] Failed to index file ${fileName}:`, err);
      processed++;
    }
  }

  console.log(`[Bedrock] Indexing complete: ${processed}/${total} files`);
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