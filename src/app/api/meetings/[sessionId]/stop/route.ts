import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { BotWorker } from "@/lib/bot-worker";
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

  const bot = BotWorker.get(sessionId);
  if (bot) {
    await bot.stop(sessionId);
  } else {
    // Bot already stopped or crashed — just mark completed/failed
    if (session.status === "IN_PROGRESS") {
      await db.meetingSession.update({
        where: { id: sessionId },
        data: { status: "FAILED", endedAt: new Date() },
      });
    }
  }

  return NextResponse.json({ success: true });
}
