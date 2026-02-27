"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmbeddingProgress } from "@/components/ui/embedding-progress";
import useRefetch from "@/hooks/use-refetch";
import { api } from "@/trpc/react";
import { Info } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type FormInput = {
  repoUrl: string;
  projectName: string;
  githubToken?: string;
};

const CreateProject = () => {
  const { register, handleSubmit, reset } = useForm<FormInput>();
  const createProject = api.project.createProject.useMutation();
  const checkCredits = api.project.checkCredits.useMutation();
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const { data: progressData } = api.project.getProgress.useQuery(
    { projectId: createdProjectId! },
    { enabled: !!createdProjectId, refetchInterval: 1000 } // Poll every second
  );

  const refetch = useRefetch();

  // When project is created successfully, start progress tracking
  useEffect(() => {
    if (progressData?.status === 'completed') {
      toast.success("Project indexed successfully! Redirecting...");
      setTimeout(() => {
        refetch();
        reset();
        setCreatedProjectId(null);
      }, 2000);
    } else if (progressData?.status === 'error') {
      toast.error(`Error: ${progressData.error || 'Failed to index project'}`);
      setCreatedProjectId(null);
    }
  }, [progressData, refetch, reset]);

  function onSubmit(data: FormInput) {
    // Check if the user has enough credits to create a project
    if (!!checkCredits.data) {
      // console.log(data)
      createProject.mutate(
        {
          githubUrl: data.repoUrl,
          name: data.projectName,
          githubToken: data.githubToken,
        },
        {
          onSuccess: (project) => {
            toast.success("Project created! Starting indexing...");
            setCreatedProjectId(project.id);
          },
          onError: (error) => {
            toast.error(error.message);
          },
        },
      );
    } else {
        checkCredits.mutate({
          githubUrl: data.repoUrl,
          githubToken: data.githubToken,
        });
    }
  }

  const hasEnoughCredits = checkCredits?.data?.userCredits ? checkCredits.data.fileCount <= checkCredits.data.userCredits : true;

  // Show progress view if indexing is in progress
  if (createdProjectId && progressData && (progressData.status === 'pending' || progressData.status === 'in-progress')) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center p-4">
        <EmbeddingProgress
          processed={progressData.processed}
          total={progressData.total}
          currentFile={progressData.currentFile}
          estimatedTimeRemaining={progressData.estimatedTimeRemaining}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center gap-12">
      <img src="/undraw_version-control_e4yu.svg" className="h-56 w-auto" />
      <div>
        <div>
          <h1 className="text-2xl font-semibold">
            Link your Github Repository
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter the URL of your repository to link it to github saas
          </p>
        </div>
        <div className="p-4">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <Input
              {...register("projectName", { required: true })}
              placeholder="Project Name"
              required
            />
            <Input
              {...register("repoUrl", { required: true })}
              placeholder="Repo Url"
              required
            />
            <Input
              {...register("githubToken")}
              placeholder="Github Token (Optional)"
            />
            <div className="h-2"></div>
            {!!checkCredits.data && (
                <>
                    <div className="mt-4 bg-green-50 px-4 py-2 border border-green-400 text-green-700 rounded-md" >
                        <div className="flex items-center gap-2">
                            <Info className="h-4" />
                            <p className="text-sm">You will be charged <strong>{checkCredits.data?.fileCount}</strong> credits</p>
                        </div>
                        <p className="text-sm text-blue-500 ml-6">Your current balance is <strong>{checkCredits.data?.userCredits}</strong> credits</p>
                    </div>
                </>
            )}
            <div className="h-4"></div>
            <Button type="submit" disabled={createProject.isPending || checkCredits.isPending || !hasEnoughCredits}>
              {!!checkCredits.data ? 'Create Project' : 'Check Credits'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateProject;
