import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const meetingRouter = createTRPCRouter({
  // List all meeting sessions for a project
  getMeetings: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify membership
      const member = await ctx.db.teamMember.findFirst({
        where: { projectId: input.projectId, userId: ctx.user.userId! },
      });
      if (!member) throw new Error("Access denied");

      return ctx.db.meetingSession.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          meetingUrl: true,
          status: true,
          duration: true,
          createdAt: true,
          endedAt: true,
          // exclude full transcript from list view
        },
      });
    }),

  // Get full detail of a single session
  getMeeting: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.meetingSession.findUnique({
        where: { id: input.sessionId },
        include: {
          project: { include: { teamMembers: { select: { userId: true } } } },
        },
      });
      if (!session) throw new Error("Session not found");

      const isMember = session.project.teamMembers.some(
        (m) => m.userId === ctx.user.userId,
      );
      if (!isMember) throw new Error("Access denied");

      return session;
    }),

  // Delete a completed or failed session
  deleteMeeting: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.meetingSession.findUnique({
        where: { id: input.sessionId },
        include: {
          project: { include: { teamMembers: { select: { userId: true } } } },
        },
      });
      if (!session) throw new Error("Session not found");

      const isMember = session.project.teamMembers.some(
        (m) => m.userId === ctx.user.userId,
      );
      if (!isMember) throw new Error("Access denied");

      if (session.status === "IN_PROGRESS") {
        throw new Error("Cannot delete a meeting that is in progress. Stop it first.");
      }

      await ctx.db.meetingSession.delete({ where: { id: input.sessionId } });
      return { success: true };
    }),
});
