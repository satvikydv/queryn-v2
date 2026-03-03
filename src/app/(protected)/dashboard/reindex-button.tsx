"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import useProject from "@/hooks/use-project";
import { toast } from "sonner";
import { useState } from "react";

export default function ReindexButton() {
  const { projectId } = useProject();
  const [loading, setLoading] = useState(false);
  const reindex = api.project.reindexProject.useMutation();

  const handleReindex = () => {
    if (!projectId) return;
    setLoading(true);
    reindex.mutate(
      { projectId },
      {
        onSuccess: ({ fileCount }) => {
          toast.success(
            `Re-indexing ${fileCount} files in the background. Q&A will be ready in a few minutes.`,
          );
          setLoading(false);
        },
        onError: (err) => {
          toast.error(`Re-index failed: ${err.message}`);
          setLoading(false);
        },
      },
    );
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={handleReindex}
      title="Re-index repository for Q&A"
    >
      <RefreshCw className={`mr-1 size-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Indexing…" : "Re-index"}
    </Button>
  );
}
