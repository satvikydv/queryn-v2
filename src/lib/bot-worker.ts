/**
 * BotWorker — Playwright-based Google Meet bot.
 *
 * Joins a Google Meet, captures remote audio via WebRTC ScriptProcessorNode,
 * streams PCM to Amazon Transcribe, accumulates the transcript, and on stop
 * generates a Bedrock summary + Amazon Q action item extraction.
 *
 * P45: Bot successfully joins meeting
 * P46: Real-time transcription via Amazon Transcribe
 * P47: Live transcript displayed with minimal delay
 * P48: Comprehensive AI summary per completed meeting
 * P49: Action items, decisions, key points extracted
 * P50: Transcripts + summaries stored and linked to projects
 */

import { EventEmitter } from "events";
import { PassThrough } from "stream";
import fs from "fs";
import path from "path";

const PLAYWRIGHT_AUTH_PATH = path.join(process.cwd(), ".pw", "queryn-auth.json");
import { chromium, type Browser, type Page } from "playwright";
import { startTranscription } from "./transcribe-stream";
import { generateText } from "./bedrock";
import { db } from "@/server/db";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// Audio capture script injected into the Meet page
// ---------------------------------------------------------------------------

const AUDIO_CAPTURE_SCRIPT = `
(function() {
  if (window.__querynInjected) return;
  window.__querynInjected = true;

  // -------------------------------------------------------------------
  // Single global AudioContext + ScriptProcessor shared across ALL
  // RTCPeerConnections. Previously each hookConnection() created its own
  // AudioContext, causing multiple simultaneous __querynAudioChunk calls
  // that interleaved chunks → garbled audio.
  // -------------------------------------------------------------------
  const ctx = new AudioContext();
  const nativeRate = ctx.sampleRate;
  const TARGET_RATE = 16000;
  const decimationRatio = Math.round(nativeRate / TARGET_RATE);

  console.log('[Queryn] Audio capture script injected. nativeRate:', nativeRate, 'decimationRatio:', decimationRatio);

  ctx.resume().catch(function() {});

  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const dest = ctx.createMediaStreamDestination();
  proc.connect(dest); // keep alive

  // A single GainNode used as a summing bus. We'll adjust its gain as
  // more tracks are added to prevent clipping (1 / trackCount).
  const mixerGain = ctx.createGain();
  mixerGain.gain.value = 1;
  mixerGain.connect(proc);

  let chunksSent = 0;
  let trackCount = 0;
  window.__querynChunkCount = 0;
  window.__querynTrackCount = 0;

  proc.onaudioprocess = function(e) {
    if (ctx.state !== 'running') { ctx.resume().catch(function(){}); return; }

    var float32 = e.inputBuffer.getChannelData(0);

    // Downsample: average decimationRatio samples (anti-aliasing)
    var outputLen = Math.floor(float32.length / decimationRatio);
    var int16 = new Int16Array(outputLen);
    var maxAmp = 0;
    for (var i = 0; i < outputLen; i++) {
      var sum = 0;
      var startIdx = i * decimationRatio;
      for (var k = 0; k < decimationRatio; k++) sum += float32[startIdx + k];
      var avg = sum / decimationRatio;
      if (Math.abs(avg) > maxAmp) maxAmp = Math.abs(avg);
      var s = Math.max(-1, Math.min(1, avg));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    var bytes = new Uint8Array(int16.buffer);
    var bin = '';
    for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
    var b64 = btoa(bin);

    if (window.__querynAudioChunk) {
      window.__querynAudioChunk(b64);
      chunksSent++;
      window.__querynChunkCount++;
      if (chunksSent === 1) {
        console.log('[Queryn] First chunk sent. tracks:', trackCount, 'maxAmp:', maxAmp.toFixed(4));
      } else if (chunksSent % 100 === 0) {
        console.log('[Queryn] Chunks:', chunksSent, 'maxAmp:', maxAmp.toFixed(4), 'tracks:', trackCount);
      }
    }
  };

  // Track deduplication — don't attach same track twice
  var attachedTrackIds = new Set();

  function attachTrack(track) {
    if (track.kind !== 'audio') return;
    if (attachedTrackIds.has(track.id)) return;
    attachedTrackIds.add(track.id);

    trackCount++;
    window.__querynTrackCount = trackCount;

    // Normalize mixer gain so N tracks don't exceed ±1.0
    mixerGain.gain.value = 1 / trackCount;

    console.log('[Queryn] Attaching track #' + trackCount + ' id:', track.id, 'mixerGain:', mixerGain.gain.value.toFixed(3));

    var src = ctx.createMediaStreamSource(new MediaStream([track]));
    src.connect(mixerGain);

    if (ctx.state === 'suspended') ctx.resume().catch(function(){});
  }

  function hookConnection(pc) {
    pc.addEventListener('track', function(e) { attachTrack(e.track); });

    // Backup: hook ontrack setter
    try {
      var _ontrack = null;
      Object.defineProperty(pc, 'ontrack', {
        get: function() { return _ontrack; },
        set: function(fn) {
          _ontrack = function(e) { attachTrack(e.track); if (fn) fn.call(pc, e); };
        },
        configurable: true
      });
    } catch(e) {}
  }

  var OrigRTC = window.RTCPeerConnection;
  window.RTCPeerConnection = function() {
    var pc = new OrigRTC(...arguments);
    hookConnection(pc);
    return pc;
  };
  Object.setPrototypeOf(window.RTCPeerConnection, OrigRTC);
  window.RTCPeerConnection.prototype = OrigRTC.prototype;

  if (window.webkitRTCPeerConnection) {
    window.webkitRTCPeerConnection = window.RTCPeerConnection;
  }
})();
`;

// ---------------------------------------------------------------------------
// BotWorker
// ---------------------------------------------------------------------------

export interface BotEvents {
  transcriptDelta: (text: string, isFinal: boolean) => void;
  status: (status: string) => void;
  error: (err: Error) => void;
  completed: () => void;
}

// ---------------------------------------------------------------------------
// Global registry — survives Next.js hot-module reloads and is shared across
// all API route module instances within the same Node.js process.
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var __querynBotRegistry: Map<string, BotWorker> | undefined;
}

function getRegistry(): Map<string, BotWorker> {
  if (!globalThis.__querynBotRegistry) {
    globalThis.__querynBotRegistry = new Map<string, BotWorker>();
  }
  return globalThis.__querynBotRegistry;
}

export class BotWorker extends EventEmitter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private audioStream: PassThrough | null = null;
  private transcribeStop: (() => void) | null = null;
  private audioFileStream: fs.WriteStream | null = null;
  private audioBytesWritten = 0;
  private transcript = "";
  private startedAt: Date | null = null;
  private stopped = false;

  static get(sessionId: string): BotWorker | undefined {
    return getRegistry().get(sessionId);
  }

  static register(sessionId: string, bot: BotWorker): void {
    getRegistry().set(sessionId, bot);
  }

  static remove(sessionId: string): void {
    getRegistry().delete(sessionId);
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  async start(sessionId: string, meetingUrl: string): Promise<void> {
    this.startedAt = new Date();
    this.emit("status", "launching");

    // Update DB status
    await db.meetingSession.update({
      where: { id: sessionId },
      data: { status: "IN_PROGRESS", botSessionId: sessionId },
    });

    // ------------------------------------------------------------------
    // Launch Chromium with PERSISTENT profile — stores full Google login
    // (cookies, IndexedDB, service workers, etc.) so you only need to
    // sign in once. Profile lives at .pw/chromium-profile/.
    // ------------------------------------------------------------------
    const profileDir = path.join(process.cwd(), ".pw", "chromium-profile");
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1280,800",
      ],
      permissions: ["microphone", "camera"],
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });

    // With persistent context, browser() returns the Browser instance
    this.browser = context.browser() ?? null;

    // Stealth: hide automation signals
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5], configurable: true });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"], configurable: true });
    });

    this.page = context.pages()[0] ?? await context.newPage();

    // Forward browser console to Node.js for debugging
    this.page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[Queryn]")) {
        console.log(`[Browser] ${text}`);
      }
    });

    // ------------------------------------------------------------------
    // Set up audio chunk receiver BEFORE navigation
    // ------------------------------------------------------------------
    this.audioStream = new PassThrough();
    let audioChunkCount = 0;

    // Create a WAV file to save audio locally for debugging (16kHz, mono, 16-bit)
    try {
      const outDir = path.join(process.cwd(), "./recordings");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const filePath = path.join(outDir, `meeting-audio-${sessionId}.wav`);
      this.audioFileStream = fs.createWriteStream(filePath, { flags: "w" });
      // Write placeholder WAV header (44 bytes). We'll patch sizes on stop.
      const header = Buffer.alloc(44);
      this.audioFileStream.write(header);
      this.audioBytesWritten = 0;
      console.log(`[BotWorker] Writing audio to: ${filePath}`);
    } catch (err) {
      console.warn("[BotWorker] Failed to create audio file for debugging:", err);
      this.audioFileStream = null;
    }

    await this.page.exposeFunction(
      "__querynAudioChunk",
      (b64: string) => {
        audioChunkCount++;
        if (audioChunkCount === 1) {
          console.log("[BotWorker] First audio chunk received");
        } else if (audioChunkCount % 100 === 0) {
          console.log(`[BotWorker] Audio chunks received: ${audioChunkCount}`);
        }

        const buf = Buffer.from(b64, "base64");

        // Always write to WAV file (independent of Transcribe state)
        if (this.audioFileStream) {
          try {
            this.audioFileStream.write(buf);
            this.audioBytesWritten += buf.length;
          } catch {
            // ignore file write errors
          }
        }

        // Write to Transcribe pipeline only if stream is still alive
        if (this.audioStream && !this.audioStream.destroyed) {
          try {
            this.audioStream.write(buf);
          } catch {
            // Transcribe stream closed — audio still captured in WAV
          }
        }
      },
    );

    // ------------------------------------------------------------------
    // Start Transcribe stream
    // ------------------------------------------------------------------
    const { stop } = await startTranscription(
      this.audioStream,
      (delta) => {
        if (delta.isFinal) {
          this.transcript += (this.transcript ? " " : "") + delta.text;
        }
        this.emit("transcriptDelta", delta.text, delta.isFinal);

        // Persist partial transcript to DB every 5 final segments
        void db.meetingSession.update({
          where: { id: sessionId },
          data: { transcript: this.transcript },
        }).catch(() => null);
      },
    );
    this.transcribeStop = stop;

    // ------------------------------------------------------------------
    // Sign into Google (if credentials provided) so bot can join restricted meetings
    // ------------------------------------------------------------------
    if (env.GOOGLE_BOT_EMAIL && env.GOOGLE_BOT_PASSWORD) {
      this.emit("status", "signing_in");
      await this.signInToGoogle(this.page);
    }

    // ------------------------------------------------------------------
    // Navigate to Google Meet
    // ------------------------------------------------------------------
    this.emit("status", "joining");

    // Inject audio hook BEFORE page loads so RTCPeerConnection is patched early
    await this.page.addInitScript(AUDIO_CAPTURE_SCRIPT);

    await this.page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait 10s for the pre-join screen to fully render before interacting
    console.log("[BotWorker] Waiting 10s for Meet pre-join screen to load...");
    await this.page.waitForTimeout(10000);

    // NOTE: addInitScript above already patches the RTCPeerConnection constructor
    // before any page JS runs, so ALL connections created during the Meet call are
    // captured. Do NOT call page.evaluate(AUDIO_CAPTURE_SCRIPT) again — it would
    // create a second hook instance that interleaves chunks → garbled audio.

    // ------------------------------------------------------------------
    // Check for hard-block "You can't join this video call"
    // ------------------------------------------------------------------
    const blocked = await this.page
      .locator("text=You can't join this video call")
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (blocked) {
      await this.browser?.close();
      await db.meetingSession.update({
        where: { id: sessionId },
        data: { status: "FAILED", endedAt: new Date() },
      });
      BotWorker.remove(sessionId);
      throw new Error(
        "Google Meet blocked the bot: 'You can't join this video call'. " +
        "Ensure the bot's Google account is invited or the meeting allows external guests.",
      );
    }

    // ------------------------------------------------------------------
    // Turn off camera + mic before joining (to avoid join prompt issues)
    // ------------------------------------------------------------------
    // Dismiss any popups
    await this.page.keyboard.press("Escape").catch(() => null);
    await this.page.waitForTimeout(1000);

    // Disable camera button if visible (toggle off)
    await this.page
      .locator('[aria-label*="camera"], [data-tooltip*="camera"], [aria-label*="Turn off camera"]')
      .first()
      .click()
      .catch(() => null);

    // Disable mic button if visible
    await this.page
      .locator('[aria-label*="microphone"], [data-tooltip*="microphone"], [aria-label*="Turn off microphone"]')
      .first()
      .click()
      .catch(() => null);

    // ------------------------------------------------------------------
    // Fill "Your name" (guest pre-join screen)
    // ------------------------------------------------------------------
    try {
      console.log("[BotWorker] Looking for name input field...");
      const nameInput = await this.page.waitForSelector(
        'input[placeholder="Your name"], input[jsname="YPqjbf"]',
        { timeout: 3000 },
      );
      if (nameInput) {
        await nameInput.click();
        await nameInput.fill("");
        await nameInput.fill("satvik yadav");
        console.log("[BotWorker] Name entered: satvik yadav");
      }
    } catch {
      console.log("[BotWorker] Name input not found — may already be signed in or skipped");
    }

    // ------------------------------------------------------------------
    // Click "Ask to join" or "Join now" or "Join meeting"
    // ------------------------------------------------------------------
    console.log("[BotWorker] Looking for join button...");


    let joined = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const btn = await this.page.waitForSelector(
          [
            'button:has-text("Ask to join")',
            'button:has-text("Join now")',
            'button:has-text("Join meeting")',
            '[data-testid="prejoin-join-button"]',
            'button[jsname="Qx7uuf"]',
          ].join(", "),
          { timeout: 10000 },
        );
        if (btn) {
          const btnText = await btn.textContent().catch(() => "");
          console.log(`[BotWorker] Clicking join button (attempt ${attempt + 1}): "${btnText?.trim()}"`);
          await btn.click();
          joined = true;
          break;
        }
      } catch {
        console.log(`[BotWorker] Join button not found on attempt ${attempt + 1}, retrying...`);
        await this.page.waitForTimeout(2000);
      }
    }

    if (!joined) {
      // Last resort — check if we are already in the meeting
      const alreadyIn = await this.page
        .locator('[data-call-ended], [jsname="r4nke"]')
        .count()
        .catch(() => 0);
      if (alreadyIn === 0) {
        this.emit("error", new Error("Could not find a join button on the Meet page."));
      }
    }

    // ------------------------------------------------------------------
    // Wait for host admission (if knocking)
    // ------------------------------------------------------------------
    await this.waitForAdmission(sessionId);

    this.emit("status", "in_meeting");

    // --------------- Diagnostic: check audio pipeline after 10s ---------------
    setTimeout(async () => {
      if (this.stopped || !this.page) return;
      try {
        const diag = await this.page.evaluate(() => ({
          injected: !!(window as any).__querynInjected,
          chunkCount: (window as any).__querynChunkCount ?? 0,
          trackCount: (window as any).__querynTrackCount ?? 0,
          audioChunkFn: typeof (window as any).__querynAudioChunk,
        }));
        console.log("[BotWorker] Audio pipeline diagnostic (10s):", JSON.stringify(diag));
        if (diag.trackCount === 0) {
          console.warn("[BotWorker] WARNING: No audio tracks captured after 10s. " +
            "RTCPeerConnection hook may not have intercepted Meet's connections.");
        }
        if (diag.chunkCount === 0 && diag.trackCount > 0) {
          console.warn("[BotWorker] WARNING: Tracks connected but no audio chunks. " +
            "AudioContext may still be suspended or audio is silent.");
        }
      } catch { /* page closed */ }
    }, 10000);

    // Watch for meeting end (page close / kicked / 30-min silence)
    this.page.on("close", () => {
      void this.stop(sessionId);
    });

    // Auto-stop if bot is alone for more than 3 minutes (everyone left)
    this.watchForEmptyMeeting(sessionId);
  }

  // ---------------------------------------------------------------------------
  // Sign into Google account
  // ---------------------------------------------------------------------------
  private async signInToGoogle(page: Page): Promise<void> {
    const email = env.GOOGLE_BOT_EMAIL;
    const password = env.GOOGLE_BOT_PASSWORD;

    if (!email || !password) {
      console.warn(
        "[BotWorker] GOOGLE_BOT_EMAIL / GOOGLE_BOT_PASSWORD not set — " +
        "bot will join as guest (may fail for restricted meetings)",
      );
      return;
    }

    // Check if already signed in via persistent profile cookies.
    // myaccount.google.com stays on that subdomain when signed in.
    // When NOT signed in it redirects to google.com/account/about or accounts.google.com/signin.
    try {
      await page.goto("https://myaccount.google.com", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      await page.waitForTimeout(2000);
      const url = page.url();
      if (url.includes("myaccount.google.com")) {
        console.log("[BotWorker] Already signed in via persistent profile — skipping login. URL:", url);
        return;
      }
      console.log("[BotWorker] Not signed in (redirected to:", url, "), proceeding with login...");
    } catch {
      console.log("[BotWorker] Could not check session, proceeding with login...");
    }

    await page.goto("https://accounts.google.com/signin/v2/identifier", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Email
    try {
      const emailInput = await page.waitForSelector(
        'input[type="email"], input[name="identifier"]',
        { timeout: 10000 },
      );
      await emailInput?.fill(email);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);
    } catch (e) {
      console.error("[BotWorker] Google sign-in: email step failed", e);
      return;
    }

    // Password
    try {
      const pwInput = await page.waitForSelector(
        'input[type="password"], input[name="Passwd"]',
        { timeout: 10000 },
      );
      await pwInput?.fill(password);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
    } catch (e) {
      console.error("[BotWorker] Google sign-in: password step failed", e);
      return;
    }

    // Handle post-login prompts (recovery email, 2-step etc.)
    // Click "Not now" / "Skip" / "Continue" type dismissals
    for (const text of ["Not now", "Skip", "Continue", "Confirm", "I agree"]) {
      await page
        .locator(`button:has-text("${text}")`)
        .first()
        .click({ timeout: 3000 })
        .catch(() => null);
      await page.waitForTimeout(500);
    }

    // Verify signed in
    const url = page.url();
    if (url.includes("accounts.google.com/signin")) {
      console.warn("[BotWorker] May not be fully signed in — URL:", url);
    } else {
      console.log("[BotWorker] Google sign-in complete. URL:", url);
    }
  }

  // ---------------------------------------------------------------------------
  // Wait for host to admit the bot (knocking state)
  // ---------------------------------------------------------------------------
  private async waitForAdmission(sessionId: string): Promise<void> {
    if (!this.page) return;

    // Detect "waiting for host" text
    const knockingSelector = [
      'text="Waiting for the host to let you in"',
      'text="Someone will let you in soon"',
      'text="Asking to be let in"',
    ].join(", ");

    let isKnocking = false;
    try {
      isKnocking = await this.page
        .locator(knockingSelector)
        .first()
        .isVisible({ timeout: 5000 });
    } catch {
      return; // Not knocking — already in
    }

    if (!isKnocking) return;

    this.emit("status", "waiting_for_host");
    console.log("[BotWorker] Knocking — waiting for host admission...");

    // Poll up to 5 minutes for admission
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      if (this.stopped) return;

      const stillKnocking = await this.page
        .locator(knockingSelector)
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (!stillKnocking) {
        // Either admitted or denied
        const denied = await this.page
          .locator("text=You can't join this video call")
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        if (denied) {
          await this.browser?.close();
          await db.meetingSession.update({
            where: { id: sessionId },
            data: { status: "FAILED", endedAt: new Date() },
          });
          BotWorker.remove(sessionId);
          throw new Error("Host denied the bot's request to join.");
        }
        return; // Admitted!
      }

      await this.page.waitForTimeout(3000);
    }

    // Timed out waiting — fail gracefully
    this.emit("error", new Error("Timed out waiting for host to admit the bot (5 min)."));
  }

  // ---------------------------------------------------------------------------
  // Watch for empty meeting
  // ---------------------------------------------------------------------------
  private watchForEmptyMeeting(sessionId: string): void {
    const check = setInterval(async () => {
      if (this.stopped || !this.page) {
        clearInterval(check);
        return;
      }
      try {
        // Google Meet shows "You're the only one here" caption
        const alone = await this.page.locator('text="You\'re the only one here"').isVisible();
        if (alone) {
          clearInterval(check);
          await this.stop(sessionId);
        }
      } catch {
        clearInterval(check);
      }
    }, 30000);
  }

  // ---------------------------------------------------------------------------
  // Stop + summarise
  // ---------------------------------------------------------------------------

  async stop(sessionId: string): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    this.emit("status", "processing");

    // Stop Transcribe stream
    this.transcribeStop?.();

    // Close browser
    try {
      await this.browser?.close();
    } catch {
      // ignore
    }

    // Finalize local WAV file (patch header with sizes)
    if (this.audioFileStream) {
      try {
        await new Promise<void>((resolve) => this.audioFileStream?.end(() => resolve()));
      } catch {}

      try {
        const outDir = path.join(process.cwd(), "./recordings");
        const filePath = path.join(outDir, `meeting-audio-${sessionId}.wav`);
        const fd = fs.openSync(filePath, "r+");
        const subchunk2Size = this.audioBytesWritten;
        const sampleRate = 16000;
        const bitsPerSample = 16;
        const channels = 1;
        const byteRate = sampleRate * channels * (bitsPerSample / 8);
        const blockAlign = channels * (bitsPerSample / 8);
        const chunkSize = 36 + subchunk2Size;
        const header = Buffer.alloc(44);
        header.write("RIFF", 0);
        header.writeUInt32LE(chunkSize, 4);
        header.write("WAVE", 8);
        header.write("fmt ", 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write("data", 36);
        header.writeUInt32LE(subchunk2Size, 40);
        fs.writeSync(fd, header, 0, 44, 0);
        fs.closeSync(fd);
        console.log(`[BotWorker] Finalized WAV header: ${filePath} (${subchunk2Size} bytes)`);
      } catch (err) {
        console.warn("[BotWorker] Failed to finalize WAV header:", err);
      }
    }

    const endedAt = new Date();
    const duration = this.startedAt
      ? Math.round((endedAt.getTime() - this.startedAt.getTime()) / 1000)
      : 0;

    // ------------------------------------------------------------------
    // Generate summary if we have a transcript (P48, P49)
    // ------------------------------------------------------------------
    let summaryData: Record<string, unknown> = {};

    if (this.transcript.length > 50) {
      try {
        const summaryPrompt = `You are an expert meeting analyst. Analyze this meeting transcript and return a JSON object with these exact keys:
- "summary": a 3-5 sentence executive summary of the meeting
- "actionItems": array of strings, each a concrete action item with owner if mentioned
- "decisions": array of strings, each a key decision made
- "keyPoints": array of strings, the most important discussion points

Transcript:
${this.transcript}

Return ONLY valid JSON, no markdown fences.`;

        const raw = await generateText(summaryPrompt, {
          model: "sonnet",
          maxTokens: 1024,
          temperature: 0.3,
        });

        // Extract JSON from the response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          summaryData = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        }
      } catch (err) {
        console.error("[BotWorker] Summary generation failed:", err);
        summaryData = {
          summary: "Summary generation failed.",
          actionItems: [],
          decisions: [],
          keyPoints: [],
        };
      }
    }

    // ------------------------------------------------------------------
    // Persist final state to DB (P50)
    // ------------------------------------------------------------------
    // Mark COMPLETED whenever the bot ran (even if transcript is empty —
    // e.g. meeting had no speech, or Transcribe didn't connect yet).
    // Only mark FAILED if bot.start() threw before reaching the meeting.
    const finalStatus = this.startedAt ? "COMPLETED" : "FAILED";

    console.log(
      `[BotWorker] Session ${sessionId} → ${finalStatus}. ` +
      `Transcript length: ${this.transcript.length} chars, Duration: ${duration}s`,
    );

    await db.meetingSession.update({
      where: { id: sessionId },
      data: {
        status: finalStatus,
        transcript: this.transcript || null,
        summary: Object.keys(summaryData).length
          ? (summaryData as Parameters<typeof db.meetingSession.update>[0]["data"]["summary"])
          : undefined,
        duration,
        endedAt,
        botSessionId: null,
      },
    });

    this.emit("status", "completed");
    this.emit("completed");
    BotWorker.remove(sessionId);
  }
}
