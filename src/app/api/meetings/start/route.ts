import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { BotWorker } from "@/lib/bot-worker";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { meetingUrl?: string; projectId?: string; title?: string };
  const { meetingUrl, projectId, title } = body;

  if (!meetingUrl || !projectId) {
    return NextResponse.json({ error: "meetingUrl and projectId are required" }, { status: 400 });
  }

  // Validate Google Meet URL
  if (!meetingUrl.includes("meet.google.com")) {
    return NextResponse.json({ error: "Only Google Meet URLs are supported" }, { status: 400 });
  }

  // Check user belongs to project
  const member = await db.teamMember.findFirst({
    where: { projectId, userId },
  });
  if (!member) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  // Check credits (5 per meeting session) — P41
  const user = await db.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (!user || user.credits < 5) {
    return NextResponse.json({ error: "Insufficient credits. Meeting bot costs 5 credits." }, { status: 402 });
  }

  // Create session record
  const session = await db.meetingSession.create({
    data: {
      projectId,
      meetingUrl,
      title: title ?? "Untitled Meeting",
      status: "SCHEDULED",
    },
  });

  // Deduct credits immediately — P40
  await db.user.update({
    where: { id: userId },
    data: { credits: { decrement: 5 } },
  });

  // Spawn bot (non-blocking — runs in background)
  const bot = new BotWorker();
  BotWorker.register(session.id, bot);

  bot.start(session.id, meetingUrl).catch(async (err) => {
    console.error("[BotWorker] Fatal error:", err);
    await db.meetingSession.update({
      where: { id: session.id },
      data: { status: "FAILED", botSessionId: null },
    }).catch(() => null);
    // Refund credits on total failure
    await db.user.update({
      where: { id: userId },
      data: { credits: { increment: 5 } },
    }).catch(() => null);
    BotWorker.remove(session.id);
  });

  return NextResponse.json({ sessionId: session.id });
}
