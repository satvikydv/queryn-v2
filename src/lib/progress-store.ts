/**
 * DB-backed progress store (serverless-safe) — Phase 5
 *
 * Strategy:
 *  - Synchronous writes go to a globalThis cache so all Next.js module
 *    instances in the same process share the same state.
 *  - Terminal status changes (pending / completed / error) are also
 *    persisted asynchronously to Project.indexingStatus + Project.indexingMeta
 *    so a different serverless pod can read them from the DB.
 */

import { IndexingStatus } from "../../generated/prisma";

export interface ProgressData {
  processed: number;
  total: number;
  currentFile: string;
  estimatedTimeRemaining: number;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  error?: string;
  phase?: 'summarizing' | 'embedding' | 'commits' | 'saving';
}

// Map status strings → Prisma enum values
const STATUS_MAP: Record<ProgressData['status'], IndexingStatus> = {
  pending:     IndexingStatus.PENDING,
  'in-progress': IndexingStatus.IN_PROGRESS,
  completed:   IndexingStatus.COMPLETED,
  error:       IndexingStatus.ERROR,
};

// Shared registry, survives Next.js module re-evaluation in the same process
declare const globalThis: typeof global & {
  __querynProgressStore?: Map<string, ProgressData>;
};

function getStore(): Map<string, ProgressData> {
  if (!globalThis.__querynProgressStore) {
    globalThis.__querynProgressStore = new Map();
  }
  return globalThis.__querynProgressStore;
}

// Lazy-imported DB client to avoid circular dependency issues
async function persistToDB(projectId: string, progress: ProgressData) {
  try {
    const { db } = await import("@/server/db");
    await db.project.update({
      where: { id: projectId },
      data: {
        indexingStatus: STATUS_MAP[progress.status],
        indexingMeta: {
          processed: progress.processed,
          total: progress.total,
          currentFile: progress.currentFile,
          phase: progress.phase ?? null,
          error: progress.error ?? null,
        },
      },
    });
  } catch (err) {
    // Non-fatal — in-memory store is still populated
    console.warn('[ProgressStore] DB persist failed:', err);
  }
}

class ProgressStore {
  setProgress(projectId: string, progress: ProgressData) {
    getStore().set(projectId, progress);

    // Persist terminal / notable states to DB (fire-and-forget)
    if (progress.status !== 'in-progress') {
      void persistToDB(projectId, progress);
    } else if (progress.phase === 'commits' || progress.processed === 0) {
      // Also sync DB at phase transitions so a restart can recover coarse state
      void persistToDB(projectId, progress);
    }
  }

  getProgress(projectId: string): ProgressData | undefined {
    return getStore().get(projectId);
  }

  deleteProgress(projectId: string) {
    getStore().delete(projectId);
  }

  clearOldProgress() {
    for (const [projectId, progress] of getStore().entries()) {
      if (progress.status === 'completed' || progress.status === 'error') {
        getStore().delete(projectId);
      }
    }
  }
}

export const progressStore = new ProgressStore();

// Clean up old progress every 10 minutes
setInterval(() => {
  progressStore.clearOldProgress();
}, 10 * 60 * 1000);
