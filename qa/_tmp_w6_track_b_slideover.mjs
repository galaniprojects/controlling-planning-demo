// v5.2 W6 Track B (S11 §13.9) — PL availability slide-over visual verification.
import pkg from '/Users/vasilis/Desktop/vision-demo-prototype/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = 'http://localhost:5173';
const OUT = '/Users/vasilis/Desktop/vision-demo-prototype/qa/screenshots/v5_2_w6_track_b';

const browser = await chromium.launch({ headless: true });

async function shot(page, filename) {
  await page.screenshot({ path: `${OUT}/${filename}`, fullPage: false });
  console.log('Saved:', filename);
}

async function setupPage(personaId, theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
  });
  const page = await ctx.newPage();
  await page.addInitScript((persona) => {
    localStorage.setItem('creta-persona', persona);
  }, personaId);
  await page.addInitScript((t) => {
    localStorage.setItem('creta-theme', t);
  }, theme);
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[browser ${theme}]`, m.text());
  });
  page.on('pageerror', (err) => {
    console.log(`[pageerror ${theme}]`, err.message);
  });
  return { ctx, page };
}

async function runFlow(theme) {
  const { ctx, page } = await setupPage('persona-pl', theme);
  const suffix = theme === 'dark' ? '_dark' : '';

  console.log(`\n=== ${theme.toUpperCase()} mode ===`);

  // 1. Open Workbench as Priya — pick the Sensor Data Pipeline (active)
  await page.goto(`${BASE}/workbench?project=proj-sensor`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Switch to Forecast & Planning tab
  try {
    const fpTab = page.locator('button[role="tab"]:has-text("Forecast"), [role="tab"]:has-text("Forecast")').first();
    if (await fpTab.count()) {
      await fpTab.click({ timeout: 3000 });
      await page.waitForTimeout(1200);
    }
  } catch (e) {
    console.log('No Forecast tab clickable:', e.message);
  }

  await shot(page, `01_fp_tab_with_check_availability${suffix}.png`);

  // 2. Click "Check availability"
  const checkBtn = page.locator('button:has-text("Check availability")').first();
  if (await checkBtn.count()) {
    await checkBtn.click();
    await page.waitForTimeout(1000);
    await shot(page, `02_slideover_open${suffix}.png`);

    // Click a role row inside the slide-over (e.g. "Data Engineer")
    try {
      // Scope to inside the slide-over, then find the role row by exact text.
      const overlay = page.locator('aside[aria-modal="true"]');
      const roleRow = overlay
        .locator('text="Data Engineer"')
        .first();
      await roleRow.scrollIntoViewIfNeeded();
      await roleRow.click({ timeout: 3000, force: true });
      await page.waitForTimeout(800);
      await shot(page, `03_slideover_role_selected${suffix}.png`);
    } catch (e) {
      console.log('Role row click failed:', e.message);
    }

    // Click "Request this role"
    const requestBtn = page.locator('button:has-text("Request this role")').first();
    if (await requestBtn.count()) {
      await requestBtn.click();
      await page.waitForTimeout(800);
      await shot(page, `04_after_request_form_populated${suffix}.png`);
    } else {
      console.log('"Request this role" button not visible — slide-over may not have selected a role');
    }
  } else {
    console.log('"Check availability" button not visible. Page may not be loaded as PL.');
  }

  // 5. Verify the standalone /capacity/availability page still works (page mode)
  await page.goto(`${BASE}/capacity/availability`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, `05_standalone_availability_page${suffix}.png`);

  await ctx.close();
}

await runFlow('light');
await runFlow('dark');
await browser.close();
console.log('\nDone.');
