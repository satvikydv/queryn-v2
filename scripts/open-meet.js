import { chromium } from 'playwright';

const AUDIO_CAPTURE_SCRIPT = `
(function() {
  if (window.__querynInjected) return;
  window.__querynInjected = true;
  console.log('[QuerynTest] audio-capture-hook-injected');
})();
`;

async function run() {
  const meetingUrl = process.argv[2] || 'https://meet.google.com/qde-axmb-dij';
  console.log('[open-meet] Launching browser...');

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,800',
    ],
  });

  const context = await browser.newContext({
    permissions: ['microphone', 'camera'],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    console.log('[Browser]', msg.text());
  });

  await page.addInitScript(AUDIO_CAPTURE_SCRIPT);

  console.log('[open-meet] Navigating to', meetingUrl);
  await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('[open-meet] Waiting 10s for pre-join screen...');
  await page.waitForTimeout(10000);

  try {
    const nameInput = await page.waitForSelector('input[placeholder="Your name"], input[jsname="YPqjbf"]', { timeout: 15000 });
    if (nameInput) {
      await nameInput.click();
      await nameInput.fill('');
      await nameInput.fill('satvik yadav');
      console.log('[open-meet] Filled name: satvik yadav');
    }
  } catch (e) {
    console.log('[open-meet] Name input not found or error:', e?.message || e);
  }

  // Wait 5s before clicking join
  await page.waitForTimeout(5000);
  console.log('[open-meet] Attempting to click join button...');

  const selectors = [
    'button:has-text("Ask to join")',
    'button:has-text("Join now")',
    'button:has-text("Join meeting")',
    '[data-testid="prejoin-join-button"]',
    'button[jsname="Qx7uuf"]',
  ];

  let clicked = false;
  for (const s of selectors) {
    try {
      const btn = await page.$(s);
      if (btn) {
        const text = (await btn.textContent()) || '';
        console.log('[open-meet] Clicking selector', s, 'text="' + text.trim() + '"');
        await btn.click();
        clicked = true;
        break;
      }
    } catch (e) {
      // continue
    }
  }

  if (!clicked) console.log('[open-meet] Could not find a join button');

  console.log('[open-meet] Waiting 60s to observe...');
  await page.waitForTimeout(60000);

  console.log('[open-meet] Closing browser');
  await browser.close();
}

run().catch((err) => {
  console.error('[open-meet] Error:', err);
  process.exit(1);
});
