/**
 * bot-server.mjs — Standalone HTTP server that runs the Playwright bot.
 * Deploy this on EC2 only. Vercel calls it via POST /start.
 *
 * Start:  node bot-server.mjs
 * Or:     pm2 start bot-server.mjs --name queryn-bot
 */

import "dotenv/config";
import http from "http";

// Lazy-load the compiled bot worker (ts-node or pre-compiled)
// We use dynamic import so ts-node/esm can handle the TypeScript
const BOT_SECRET = process.env.BOT_SERVER_SECRET;
const PORT = parseInt(process.env.BOT_SERVER_PORT ?? "3001", 10);

if (!BOT_SECRET) {
  console.error("BOT_SERVER_SECRET env var is required");
  process.exit(1);
}

/** Simple JSON body reader */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

/** Validate bearer token */
function isAuthorized(req) {
  const auth = req.headers["authorization"] ?? "";
  return auth === `Bearer ${BOT_SECRET}`;
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Start bot
  if (req.method === "POST" && req.url === "/start") {
    if (!isAuthorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const { sessionId, meetingUrl } = body;
    if (!sessionId || !meetingUrl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "sessionId and meetingUrl are required" }));
      return;
    }

    // Acknowledge immediately — bot runs async
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessionId }));

    // Dynamic import to avoid startup-time TypeScript compile issues
    try {
      const { BotWorker } = await import("./src/lib/bot-worker.js");
      const bot = new BotWorker();
      BotWorker.register(sessionId, bot);

      bot.start(sessionId, meetingUrl).catch(async (err) => {
        console.error(`[bot-server] BotWorker fatal error for ${sessionId}:`, err);
        // DB update is handled inside BotWorker.stop() — just log here
      });

      console.log(`[bot-server] Bot started for session ${sessionId}`);
    } catch (err) {
      console.error("[bot-server] Failed to start bot:", err);
    }

    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[bot-server] Listening on port ${PORT}`);
});
