import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { BotWorker } from "@/lib/bot-worker";
import { env } from "@/env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;

  const session = await db.meetingSession.findUnique({
    where: { id: sessionId },
    include: { project: { include: { teamMembers: true } } },
  });

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const isMember = session.project.teamMembers.some((m) => m.userId === userId);
  if (!isMember) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  // If running on EC2, forward the stop command to the bot server
  if (env.BOT_SERVER_URL && env.BOT_SERVER_SECRET) {
    await fetch(`${env.BOT_SERVER_URL}/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.BOT_SERVER_SECRET}`,
      },
      body: JSON.stringify({ sessionId }),
    }).catch(() => null); // best-effort — DB update below handles the rest

    // Always mark the session as completed in DB regardless of EC2 response
    if (session.status === "IN_PROGRESS") {
      await db.meetingSession.update({
        where: { id: sessionId },
        data: { status: "COMPLETED", endedAt: new Date() },
      });
    }
  } else {
    // Local dev — bot runs in-process
    const bot = BotWorker.get(sessionId);
    if (bot) {
      await bot.stop(sessionId);
    } else if (session.status === "IN_PROGRESS") {
      await db.meetingSession.update({
        where: { id: sessionId },
        data: { status: "FAILED", endedAt: new Date() },
      });
    }
  }

  return NextResponse.json({ success: true });
}
