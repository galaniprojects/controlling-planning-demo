// v5.2 W6 Track B (#8.3) — DashboardLayer responsive max-height check.
import pkg from '/Users/vasilis/Desktop/vision-demo-prototype/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:5173';
const OUT = '/Users/vasilis/Desktop/vision-demo-prototype/qa/screenshots/v5_2_w6_track_b';

const browser = await chromium.launch({ headless: true });

async function run(viewport, label) {
  const ctx = await browser.newContext({
    viewport,
    colorScheme: 'light',
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('creta-persona', 'persona-controller');
    localStorage.setItem('creta-theme', 'light');
    // Force dashboard expanded
    localStorage.removeItem('creta_capacity_dashboard_collapsed');
  });
  await page.goto(`${BASE}/capacity?scope=all_ccs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/06_dashboard_${label}.png`, fullPage: false });
  console.log('Saved:', `06_dashboard_${label}.png`);
  await ctx.close();
}

// Tall viewport — 2-col layout, fits 320px
await run({ width: 1440, height: 1100 }, 'tall_1100');
// Short viewport — should stack to 1-col so cards aren't clipped
await run({ width: 1440, height: 800 }, 'short_800');

await browser.close();
console.log('Done.');
