import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { NextResponse } from "next/server";
import { env } from "@/env";

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

  // Launch the bot — either on EC2 (production) or in-process (local dev)
  if (env.BOT_SERVER_URL) {
    // ── Production: delegate to the EC2 bot server ──────────────────────────
    const botRes = await fetch(`${env.BOT_SERVER_URL}/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.BOT_SERVER_SECRET}`,
      },
      body: JSON.stringify({ sessionId: session.id, meetingUrl }),
    }).catch((err: unknown) => {
      console.error("[meetings/start] Failed to reach bot server:", err);
      return null;
    });

    if (!botRes || !botRes.ok) {
      // Refund credits — bot never started
      await db.user.update({ where: { id: userId }, data: { credits: { increment: 5 } } }).catch(() => null);
      await db.meetingSession.update({ where: { id: session.id }, data: { status: "FAILED" } }).catch(() => null);
      return NextResponse.json({ error: "Bot server unavailable. Credits refunded." }, { status: 503 });
    }
  } else {
    // ── Local dev: spawn bot in-process ─────────────────────────────────────
    const { BotWorker } = await import("@/lib/bot-worker");
    const bot = new BotWorker();
    BotWorker.register(session.id, bot);

    bot.start(session.id, meetingUrl).catch(async (err) => {
      console.error("[BotWorker] Fatal error:", err);
      await db.meetingSession.update({
        where: { id: session.id },
        data: { status: "FAILED", botSessionId: null },
      }).catch(() => null);
      await db.user.update({
        where: { id: userId },
        data: { credits: { increment: 5 } },
      }).catch(() => null);
      BotWorker.remove(session.id);
    });
  }

  return NextResponse.json({ sessionId: session.id });
}
