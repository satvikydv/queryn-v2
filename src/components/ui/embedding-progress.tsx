"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, FileCode, Sparkles, GitCommit } from "lucide-react";

interface EmbeddingProgressProps {
  processed: number;
  total: number;
  currentFile: string;
  estimatedTimeRemaining: number; // in seconds
  phase?: 'summarizing' | 'embedding' | 'commits' | 'saving';
}

export function EmbeddingProgress({
  processed,
  total,
  currentFile,
  estimatedTimeRemaining,
  phase = 'embedding',
}: EmbeddingProgressProps) {
  const percentage = Math.round((processed / total) * 100);

  const getPhaseInfo = () => {
    switch (phase) {
      case 'summarizing':
        return {
          icon: <FileCode className="h-5 w-5 animate-pulse" />,
          title: 'Analyzing Code Files',
          description: 'Generating AI summaries for your code files with rate limiting'
        };
      case 'embedding':
        return {
          icon: <Sparkles className="h-5 w-5 animate-pulse" />,
          title: 'Generating Embeddings',
          description: 'Creating vector embeddings for semantic search'
        };
      case 'commits':
        return {
          icon: <GitCommit className="h-5 w-5 animate-pulse" />,
          title: 'Processing Commits',
          description: 'Analyzing commit history and generating summaries'
        };
      case 'saving':
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
          title: 'Saving to Database',
          description: 'Persisting all data to the database'
        };
      default:
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
          title: 'Processing Repository',
          description: 'Processing your repository files with AI'
        };
    }
  };

  const phaseInfo = getPhaseInfo();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {phaseInfo.icon}
          {phaseInfo.title}
        </CardTitle>
        <CardDescription>
          {phaseInfo.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {phase === 'commits' ? 'Commits' : 'Files'} Processed
            </span>
            <span className="text-2xl font-bold">
              {processed} <span className="text-muted-foreground">/ {total}</span>
            </span>
          </div>
          <Progress value={percentage} className="h-3" />
          <div className="text-center text-sm text-muted-foreground">
            {percentage}% complete
          </div>
        </div>

        {currentFile && (
          <div className="space-y-1 pt-2 border-t">
            <div className="text-sm text-muted-foreground">Currently processing:</div>
            <div className="font-mono text-xs bg-muted p-2 rounded truncate" title={currentFile}>
              {currentFile}
            </div>
          </div>
        )}

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            💡 Tip: We&apos;re using rate limiting to respect API limits. This ensures stable processing
            for large repositories.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
