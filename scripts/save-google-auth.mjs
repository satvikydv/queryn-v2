/**
 * One-time Google auth saver for the Queryn meeting bot.
 *
 * Run this script ONCE to log into Google manually, then the bot will
 * reuse the saved session on every subsequent run — no re-login needed.
 *
 * Usage:
 *   node scripts/save-google-auth.mjs
 *
 * The script will:
 *  1. Open a visible Chrome window
 *  2. Navigate to Google sign-in
 *  3. Wait for you to sign in manually (up to 5 minutes)
 *  4. Save cookies + localStorage to .pw/queryn-auth.json
 *  5. Exit
 *
 * The bot-worker.ts will automatically load this file on every run.
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_PATH = path.join(__dirname, "..", ".pw", "queryn-auth.json");

async function main() {
  console.log("=".repeat(60));
  console.log("  Queryn Bot — Google Auth Saver");
  console.log("=".repeat(60));
  console.log("\nOpening Chrome... Please sign in to Google when prompted.");
  console.log("You have 5 minutes to complete sign-in.");
  console.log("The window will close automatically after you're signed in.\n");

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-infobars",
      "--window-size=1000,700",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1000, height: 700 },
  });

  // Remove webdriver flag so Google doesn't detect automation
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
      configurable: true,
    });
  });

  const page = await context.newPage();
  await page.goto("https://accounts.google.com/signin");

  console.log("Waiting for you to sign in...");
  console.log("(The script will auto-detect when you reach the Google account page)");

  // Wait until we land on a google.com page that's not the sign-in flow
  try {
    await page.waitForURL(
      (url) =>
        url.hostname.endsWith("google.com") &&
        !url.pathname.startsWith("/signin") &&
        !url.pathname.startsWith("/oauth") &&
        !url.hostname.includes("accounts"),
      { timeout: 5 * 60 * 1000 }, // 5 minutes
    );
  } catch {
    // Also accept if we're on myaccount.google.com or similar
    const url = page.url();
    if (!url.includes("google.com")) {
      console.error("\nSign-in timed out or failed. Please try again.");
      await browser.close();
      process.exit(1);
    }
  }

  console.log("\n✅ Sign-in detected! Saving session...");

  // Ensure .pw directory exists
  const authDir = path.dirname(AUTH_PATH);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Save full storage state (cookies + localStorage)
  await context.storageState({ path: AUTH_PATH });

  console.log(`✅ Session saved to: ${AUTH_PATH}`);
  console.log("\nThe bot will now reuse this session automatically.");
  console.log("You only need to run this script again if the session expires.\n");

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
