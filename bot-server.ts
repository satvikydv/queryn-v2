/**
 * bot-server.ts — Standalone HTTP server that runs the Playwright bot on EC2.
 *
 * Vercel calls POST /start → this server spawns BotWorker → writes results to DB.
 * Both Vercel and this server share the same Neon DATABASE_URL.
 *
 * Run on EC2:
 *   npx tsx bot-server.ts
 *
 * Keep running with PM2:
 *   pm2 start 'npx tsx bot-server.ts' --name queryn-bot
 */

import "dotenv/config"; // must be first — loads .env before @/env validation runs
import http from "http";
import { BotWorker } from "@/lib/bot-worker";

const BOT_SECRET = process.env.BOT_SERVER_SECRET;
const PORT = parseInt(process.env.BOT_SERVER_PORT ?? "3001", 10);

if (!BOT_SECRET) {
  console.error("[bot-server] BOT_SERVER_SECRET env var is required");
  process.exit(1);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const auth = req.headers["authorization"] ?? "";
  return auth === `Bearer ${BOT_SECRET}`;
}

const server = http.createServer(async (req, res) => {
  // ── Health check ──────────────────────────────────────────────────────────
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Start bot ─────────────────────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/start") {
    if (!isAuthorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const { sessionId, meetingUrl } = body as { sessionId?: string; meetingUrl?: string };
    if (!sessionId || !meetingUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "sessionId and meetingUrl are required" }));
      return;
    }

    // Acknowledge immediately — bot runs in the background
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessionId }));

    // Spawn BotWorker (non-blocking)
    const bot = new BotWorker();
    BotWorker.register(sessionId, bot);

    bot.start(sessionId, meetingUrl).catch((err: unknown) => {
      console.error(`[bot-server] BotWorker fatal error for ${sessionId}:`, err);
      // BotWorker.stop() already writes FAILED status to DB
    });

    console.log(`[bot-server] Bot started → session ${sessionId}`);
    return;
  }

  // ── Stop bot ──────────────────────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/stop") {
    if (!isAuthorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const { sessionId } = body as { sessionId?: string };
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "sessionId is required" }));
      return;
    }

    const bot = BotWorker.get(sessionId);
    if (bot) {
      await bot.stop(sessionId).catch((err: unknown) => {
        console.error(`[bot-server] Error stopping ${sessionId}:`, err);
      });
      console.log(`[bot-server] Bot stopped → session ${sessionId}`);
    } else {
      console.log(`[bot-server] No active bot for session ${sessionId} (already stopped?)`);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessionId }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[bot-server] Listening on :${PORT}`);
});
