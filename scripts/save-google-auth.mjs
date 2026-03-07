/**
 * One-time Google auth setup for the Queryn meeting bot.
 *
 * Run ONCE to log into Google — the persistent profile stores everything
 * (cookies, IndexedDB, service workers) so the bot stays signed in.
 *
 * Usage:   node scripts/save-google-auth.mjs
 */

import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, "..", ".pw", "chromium-profile");

async function main() {
  console.log("=".repeat(60));
  console.log("  Queryn Bot — Google Auth Setup (persistent profile)");
  console.log("=".repeat(60));
  console.log("\nOpening Chrome... Please sign into Google when prompted.");
  console.log("You have 5 minutes. Close the window when done.\n");

  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--window-size=1000,700",
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1000, height: 700 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
  });

  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("https://accounts.google.com/signin");

  console.log("Waiting for sign-in... (close the browser window when done)");

  // Wait for user to close the browser or timeout after 5 min
  try {
    await new Promise((resolve) => {
      context.on("close", resolve);
      setTimeout(resolve, 5 * 60 * 1000);
    });
  } catch {}

  console.log("\n✅ Profile saved to:", PROFILE_DIR);
  console.log("The bot will now use this profile and stay signed in.\n");

  try { await context.close(); } catch {}
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
