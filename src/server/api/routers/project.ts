import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { pollCommits } from "@/lib/github";
import { checkCredits, indexGithubRepo } from "@/lib/github-loader";
import { progressStore } from "@/lib/progress-store";
import { env } from "@/env";

export const projectRouter = createTRPCRouter({
  //this is the endpoint for creating a project
  createProject: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(100).trim(),
        githubUrl: z.string().url("Must be a valid URL").max(500)
          .refine((u) => u.startsWith("https://github.com/"), {
            message: "Must be a GitHub URL",
          }),
        githubToken: z.string().max(200).optional(),
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


      // Atomic: create project + deduct credits in a single transaction (P57)
      const { project, newCredits } = await ctx.db.$transaction(async (tx) => {
        const proj = await tx.project.create({
          data: {
            name: input.name,
            githubUrl: input.githubUrl,
            teamMembers: {
              create: { userId: ctx.user.userId! },
            },
          },
        });
        const updated = await tx.user.update({
          where: { id: ctx.user.userId! },
          data: { credits: { decrement: fileCount } },
          select: { credits: true },
        });
        return { project: proj, newCredits: updated.credits };
      });

      // Low-balance notification hook (P44)
      if (newCredits <= env.LOW_BALANCE_THRESHOLD) {
        console.warn(
          `[Credits] User ${ctx.user.userId} balance low: ${newCredits} credits remaining (threshold: ${env.LOW_BALANCE_THRESHOLD})`
        );
        // TODO: plug in email/push notification here when notification service is wired
      }

      // Initialize progress tracking
      progressStore.setProgress(project.id, {
        processed: 0,
        total: fileCount,
        currentFile: '',
        estimatedTimeRemaining: 0,
        status: 'pending',
        phase: 'summarizing'
      });

      // Index repository with progress tracking (background, non-blocking)
      indexGithubRepo(project.id, input.githubUrl, input.githubToken, (progress) => {
        progressStore.setProgress(project.id, {
          ...progress,
          status: 'in-progress',
          phase: 'embedding'
        });
      }).then(() => {
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

      return project;
    }),

  //this is the endpoint for getting all projects
  getProjects: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.project.findMany({
      where: {
        teamMembers: {
          some: {
            userId: ctx.user.userId!,
          },
        },
        deletedAt: null,
      },
      include: {
        teamMembers: true,
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
        projectId: z.string().min(1),
        question: z.string().min(1, "Question is required").max(2000),
        answer: z.string().max(50_000),
        filesReferences: z.any(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.qAInteraction.create({
        data: {
          projectId: input.projectId,
          question: input.question,
          answer: input.answer,
          context: input.filesReferences,
          userId: ctx.user.userId!,
        },
      });
    }),

  getQuestions: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.qAInteraction.findMany({
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
        projectId: z.string().min(1),
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
      return await ctx.db.teamMember.findMany({
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

  // Re-index an existing project's repository
  reindexProject: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      githubToken: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findFirst({
        where: {
          id: input.projectId,
          teamMembers: { some: { userId: ctx.user.userId! } },
          deletedAt: null,
        },
        select: { id: true, githubUrl: true },
      });
      if (!project) throw new Error('Project not found or access denied');

      const fileCount = await checkCredits(project.githubUrl, input.githubToken);

      progressStore.setProgress(project.id, {
        processed: 0,
        total: fileCount,
        currentFile: '',
        estimatedTimeRemaining: 0,
        status: 'pending',
        phase: 'summarizing',
      });

      indexGithubRepo(project.id, project.githubUrl, input.githubToken, (progress) => {
        progressStore.setProgress(project.id, { ...progress, status: 'in-progress' });
      }).then(() => {
        progressStore.setProgress(project.id, {
          processed: fileCount, total: fileCount, currentFile: '',
          estimatedTimeRemaining: 0, status: 'completed',
        });
      }).catch((error) => {
        console.error('Error during re-indexing:', error);
        progressStore.setProgress(project.id, {
          processed: 0, total: fileCount, currentFile: '',
          estimatedTimeRemaining: 0, status: 'error', error: error.message,
        });
      });

      return { success: true, fileCount };
    }),

  // Get embedding progress for a project
  getProgress: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      // Prefer live in-memory state (set during active indexing)
      const live = progressStore.getProgress(input.projectId);
      if (live) return live;

      // Fall back to DB for serverless recovery (P57 — DB-backed progress)
      const project = await ctx.db.project.findFirst({
        where: {
          id: input.projectId,
          teamMembers: { some: { userId: ctx.user.userId! } },
        },
        select: { indexingStatus: true, indexingMeta: true },
      });
      if (!project || project.indexingStatus === 'IDLE') return null;

      const meta = (project.indexingMeta ?? {}) as Record<string, unknown>;
      return {
        processed: (meta.processed as number) ?? 0,
        total: (meta.total as number) ?? 0,
        currentFile: (meta.currentFile as string) ?? '',
        estimatedTimeRemaining: 0,
        status: project.indexingStatus.toLowerCase().replace('_', '-') as 'pending' | 'in-progress' | 'completed' | 'error',
        phase: (meta.phase as 'summarizing' | 'embedding' | 'commits' | 'saving' | undefined) ?? undefined,
        error: (meta.error as string | undefined) ?? undefined,
      };
    }),

  // Semantic + text search across projects and Q&A history (P66)
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(200).trim() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.userId!;
      const q = input.query;

      if (q.length < 2) return { projects: [], questions: [] };

      const [projects, questions] = await Promise.all([
        ctx.db.project.findMany({
          where: {
            deletedAt: null,
            teamMembers: { some: { userId } },
            name: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, name: true, githubUrl: true },
          take: 5,
        }),
        ctx.db.qAInteraction.findMany({
          where: {
            userId,
            question: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, question: true, projectId: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      return { projects, questions };
    }),
});
