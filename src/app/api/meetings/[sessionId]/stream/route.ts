import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { BotWorker } from "@/lib/bot-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint — client connects here to receive live transcript deltas
 * and bot status updates while a meeting is in progress.
 *
 * Event types:
 *   data: {"type":"status","payload":"in_meeting"}
 *   data: {"type":"transcript","payload":"Hello...","isFinal":true}
 *   data: {"type":"completed"}
 *   data: {"type":"error","payload":"message"}
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { sessionId } = await params;

  const session = await db.meetingSession.findUnique({
    where: { id: sessionId },
    include: { project: { include: { teamMembers: true } } },
  });

  if (!session) return new Response("Not found", { status: 404 });

  const isMember = session.project.teamMembers.some((m) => m.userId === userId);
  if (!isMember) return new Response("Forbidden", { status: 403 });

  // If already completed, stream the stored transcript and close
  if (session.status === "COMPLETED" || session.status === "FAILED") {
    const payload = JSON.stringify({
      type: "completed",
      transcript: session.transcript,
      summary: session.summary,
    });
    return new Response(`data: ${payload}\n\n`, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }

  // Streaming SSE via ReadableStream
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      // Ping every 15s to keep connection alive
      const pingInterval = setInterval(() => {
        send({ type: "ping" });
      }, 15000);

      // The bot may not be in the registry yet if the client connected before
      // bot.start() completed registration (race condition). Retry for up to 8s.
      const attachBot = (attemptsLeft: number) => {
        const bot = BotWorker.get(sessionId);

        if (!bot) {
          if (attemptsLeft <= 0) {
            send({ type: "error", payload: "Bot not running" });
            clearInterval(pingInterval);
            controller.close();
            return;
          }
          setTimeout(() => attachBot(attemptsLeft - 1), 500);
          return;
        }

        bot.on("status", (status: string) => {
          send({ type: "status", payload: status });
        });

        bot.on("transcriptDelta", (text: string, isFinal: boolean) => {
          send({ type: "transcript", payload: text, isFinal });
        });

        bot.on("error", (err: Error) => {
          send({ type: "error", payload: err.message });
          clearInterval(pingInterval);
          controller.close();
        });

        bot.on("completed", () => {
          // Fetch final data from DB and send
          void db.meetingSession.findUnique({ where: { id: sessionId } }).then((s) => {
            send({
              type: "completed",
              transcript: s?.transcript,
              summary: s?.summary,
            });
            clearInterval(pingInterval);
            controller.close();
          });
        });
      };

      attachBot(16); // 16 × 500ms = 8s max wait
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
