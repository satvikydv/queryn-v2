// Simple in-memory store for tracking embedding progress
// In production, you'd want to use Redis or a similar solution

interface ProgressData {
  processed: number;
  total: number;
  currentFile: string;
  estimatedTimeRemaining: number;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  error?: string;
  phase?: 'summarizing' | 'embedding' | 'commits' | 'saving';
}

class ProgressStore {
  private progressMap = new Map<string, ProgressData>();

  setProgress(projectId: string, progress: ProgressData) {
    this.progressMap.set(projectId, progress);
  }

  getProgress(projectId: string): ProgressData | undefined {
    return this.progressMap.get(projectId);
  }

  deleteProgress(projectId: string) {
    this.progressMap.delete(projectId);
  }

  clearOldProgress() {
    // Clear progress older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [projectId, progress] of this.progressMap.entries()) {
      if (progress.status === 'completed' || progress.status === 'error') {
        this.progressMap.delete(projectId);
      }
    }
  }
}

export const progressStore = new ProgressStore();

// Clean up old progress every 10 minutes
setInterval(() => {
  progressStore.clearOldProgress();
}, 10 * 60 * 1000);
