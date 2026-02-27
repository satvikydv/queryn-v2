import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { pollCommits } from "@/lib/github";
import { checkCredits, indexGithubRepo } from "@/lib/github-loader";
import { progressStore } from "@/lib/progress-store";

export const projectRouter = createTRPCRouter({
  //this is the endpoint for creating a project
  createProject: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        githubUrl: z.string(),
        githubToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: {
          id: ctx.user.userId!,
        },
        select: {
          credits: true,
        }
      });
      if(!user) throw new Error("User not found");

      const currentCredits = user.credits || 0;
      const fileCount = await checkCredits(input.githubUrl, input.githubToken);
      if(currentCredits < fileCount) {
        throw new Error("Insufficient credits");
      }


      const project = await ctx.db.project.create({
        data: {
          name: input.name,
          githubUrl: input.githubUrl,
          UserToProject: {
            create: {
              userId: ctx.user.userId!,
            },
          },
        },
      });

      // Initialize progress tracking
      progressStore.setProgress(project.id, {
        processed: 0,
        total: fileCount,
        currentFile: '',
        estimatedTimeRemaining: 0,
        status: 'pending',
        phase: 'summarizing'
      });

      // Index repository with progress tracking
      indexGithubRepo(project.id, input.githubUrl, input.githubToken, (progress) => {
        progressStore.setProgress(project.id, {
          ...progress,
          status: 'in-progress',
          phase: 'embedding'
        });
      }).then(() => {
        // Start commit processing after indexing
        progressStore.setProgress(project.id, {
          processed: fileCount,
          total: fileCount,
          currentFile: 'Processing commits...',
          estimatedTimeRemaining: 0,
          status: 'in-progress',
          phase: 'commits'
        });
        
        return pollCommits(project.id, input.githubToken);
      }).then(() => {
        progressStore.setProgress(project.id, {
          processed: fileCount,
          total: fileCount,
          currentFile: '',
          estimatedTimeRemaining: 0,
          status: 'completed'
        });
      }).catch((error) => {
        console.error('Error during project creation:', error);
        progressStore.setProgress(project.id, {
          processed: 0,
          total: fileCount,
          currentFile: '',
          estimatedTimeRemaining: 0,
          status: 'error',
          error: error.message
        });
      });

      //update credits after project creation
      await ctx.db.user.update({
        where: {
          id: ctx.user.userId!,
        },
        data: {
          credits: {
            decrement: fileCount,
          }
        }
      })
      return project;
    }),

  //this is the endpoint for getting all projects
  getProjects: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.project.findMany({
      where: {
        UserToProject: {
          some: {
            userId: ctx.user.userId!,
          },
        },
        deletedAt: null,
      },
      include: {
        UserToProject: true,
      },
    });
  }),

  //this is the endpoint for getting the commit history of a project
  getCommits: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // pollCommits(input.projectId).then().catch(console.error)
      return await ctx.db.commit.findMany({
        where: { projectId: input.projectId },
        orderBy: { commitDate: 'desc' }
      });
    }),

  // Load more commits (next 10)
  loadMoreCommits: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        githubToken: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await pollCommits(input.projectId, input.githubToken);
      return { success: true };
    }),

  saveAnswer: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        question: z.string(),
        answer: z.string(),
        filesReferences: z.any(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.question.create({
        data: {
          projectId: input.projectId,
          question: input.question,
          answer: input.answer,
          filesReferences: input.filesReferences,
          userId: ctx.user.userId!,
        },
      });
    }),

  getQuestions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.question.findMany({
        where: {
          projectId: input.projectId,
        },
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),

  //archive
  archiveProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.project.update({
        where: { id: input.projectId },
        data: {
          deletedAt: new Date(),
        },
      });
    }),

  //get team members
  getTeamMembers: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await ctx.db.userToProject.findMany({
        where: {
          projectId: input.projectId,
        },
        include: {
          user: true,
        },
      });
    }),

  //get credits
  getMyCredits: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.user.findUnique({
      where: {
        id: ctx.user.userId!,
      },
      select: {
        credits: true,
        firstName: true,
        email: true,
      },
    });
  }),

  checkCredits: protectedProcedure.input(z.object({ githubUrl: z.string(), githubToken: z.string().optional() }))
  .mutation(async ({ ctx, input }) => {
    const fileCount = await checkCredits(input.githubUrl, input.githubToken);
    const userCredits = await ctx.db.user.findUnique({
      where: {
        id: ctx.user.userId!,
      },
      select: {
        credits: true,
      }
    })
    return {
      fileCount,
      userCredits: userCredits?.credits || 0,
    };
  }),

  // Get embedding progress for a project
  getProgress: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const progress = progressStore.getProgress(input.projectId);
      return progress || null;
    }),
});
