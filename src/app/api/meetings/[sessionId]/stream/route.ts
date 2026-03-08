import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";

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

      // Poll the database every 2s for transcript/status updates.
      // This works whether the bot runs in-process (local dev) or on EC2 (production) —
      // both paths write directly to the same Neon DB.
      let lastTranscript = "";
      let lastStatus = "";

      const pollInterval = setInterval(async () => {
        try {
          const s = await db.meetingSession.findUnique({ where: { id: sessionId } });
          if (!s) {
            clearInterval(pollInterval);
            clearInterval(pingInterval);
            send({ type: "error", payload: "Session not found" });
            controller.close();
            return;
          }

          // Emit status changes
          const currentStatus = s.status.toLowerCase();
          if (currentStatus !== lastStatus) {
            send({ type: "status", payload: currentStatus });
            lastStatus = currentStatus;
          }

          // Emit new transcript content as a delta
          const currentTranscript = s.transcript ?? "";
          if (currentTranscript.length > lastTranscript.length) {
            const delta = currentTranscript.slice(lastTranscript.length);
            send({ type: "transcript", payload: delta, isFinal: true });
            lastTranscript = currentTranscript;
          }

          // Done
          if (s.status === "COMPLETED" || s.status === "FAILED") {
            clearInterval(pollInterval);
            clearInterval(pingInterval);
            send({ type: "completed", transcript: s.transcript, summary: s.summary });
            controller.close();
          }
        } catch {
          // DB error — keep polling, don't crash the stream
        }
      }, 2000);
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
