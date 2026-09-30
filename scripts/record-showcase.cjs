// Automated Product Showcase Recorder using Playwright
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const RECORDINGS_DIR = path.resolve(__dirname, '../recordings');

// Helper for smooth Bezier curve mouse movement
async function smoothMouseMove(page, startX, startY, targetX, targetY, steps = 30) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const curX = startX + (targetX - startX) * ease;
    const curY = startY + (targetY - startY) * ease;
    await page.mouse.move(curX, curY);
    await page.waitForTimeout(16); // ~60fps movement
  }
}

// Helper to inject cursor overlay script
async function injectCursor(page) {
  const scriptContent = fs.readFileSync(path.join(__dirname, 'cursor-overlay.js'), 'utf8');
  await page.evaluate(scriptContent);
}

async function record() {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  console.log('🚀 Launching Playwright Chromium for 1080p Screen Recording...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--hide-scrollbars', '--disable-features=Translate', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: RECORDINGS_DIR,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();
  let mouseX = 960;
  let mouseY = 540;

  console.log('🔐 Authenticating into Datlion Cnergy Plant OS...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.fill('#username', 'indrajeet.date@cnergy.co.in');
  await page.fill('#password', 'thisisbusiness');
  await page.click('button[type="submit"]');
  await page.waitForSelector('header', { timeout: 10000 });
  await page.waitForTimeout(1500);

  const cues = [];
  const startTime = Date.now();

  function markCue(id, stepNum, stepTotal, category, icon, title, subtitle, focusX = 960, focusY = 540, zoom = 1.25) {
    const elapsed = (Date.now() - startTime) / 1000;
    // Set previous cue's end time if exists
    if (cues.length > 0) {
      cues[cues.length - 1].endSec = elapsed;
    }
    cues.push({
      id,
      stepNum,
      stepTotal,
      category,
      icon,
      title,
      subtitle,
      startSec: elapsed,
      endSec: elapsed + 10, // default fallback
      focusX,
      focusY,
      zoom
    });
    console.log(`⏱️ [${elapsed.toFixed(1)}s] ${title}`);
  }

  try {
    // ==========================================
    // 1. RAW MATERIALS & INWARDING
    // ==========================================
    console.log('--- Step 1: Raw Materials & Inwarding ---');
    await page.goto(`${BASE_URL}/?view=received`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    await page.mouse.move(mouseX, mouseY);
    markCue(
      'raw_materials',
      '01',
      '06',
      'RAW INVENTORY',
      '🏷️',
      'Smart Raw Material Inwarding',
      'Real-time purchase unit costs & plant stock valuation',
      560,
      380,
      1.24
    );

    await page.waitForTimeout(1500);
    // Smooth glide over Valuation KPI header cards
    await smoothMouseMove(page, mouseX, mouseY, 350, 180, 25);
    mouseX = 350; mouseY = 180;
    await page.waitForTimeout(1200);

    // Smooth glide across compact cards
    await smoothMouseMove(page, mouseX, mouseY, 560, 380, 30);
    mouseX = 560; mouseY = 380;
    await page.waitForTimeout(1200);

    // Click on Edit / Unit Cost badge on the first card
    const costBadge = await page.$('div[title*="Click to enter card"], button:has-text("₹")');
    if (costBadge) {
      const box = await costBadge.boundingBox();
      if (box) {
        await smoothMouseMove(page, mouseX, mouseY, box.x + box.width / 2, box.y + box.height / 2, 25);
        mouseX = box.x + box.width / 2;
        mouseY = box.y + box.height / 2;
        await page.mouse.down();
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(2200); // Showcase open modal/drawer
      }
    }

    // Close modal if open
    const closeBtn = await page.$('button[aria-label="Close"], button:has-text("✕"), button:has-text("Cancel")');
    if (closeBtn) {
      const cBox = await closeBtn.boundingBox();
      if (cBox) {
        await smoothMouseMove(page, mouseX, mouseY, cBox.x + cBox.width / 2, cBox.y + cBox.height / 2, 20);
        mouseX = cBox.x + cBox.width / 2;
        mouseY = cBox.y + cBox.height / 2;
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.up();
      }
    }
    await page.waitForTimeout(1500);

    // ==========================================
    // 2. CELL TESTING & QC
    // ==========================================
    console.log('--- Step 2: Cell Testing & QC ---');
    await page.goto(`${BASE_URL}/?view=testing`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    markCue(
      'cell_testing',
      '02',
      '06',
      'QUALITY CONTROL',
      '🧪',
      'Automated Cell Grading & QC',
      'Precision IR (mΩ), voltage & capacity sorting before pack assembly',
      780,
      440,
      1.22
    );

    await smoothMouseMove(page, mouseX, mouseY, 780, 440, 30);
    mouseX = 780; mouseY = 440;
    await page.waitForTimeout(2000);

    // Glide across test results table & filters
    await smoothMouseMove(page, mouseX, mouseY, 920, 520, 25);
    mouseX = 920; mouseY = 520;
    await page.waitForTimeout(3000);

    // ==========================================
    // 3. WIP ASSEMBLY & PRODUCTION RUNS
    // ==========================================
    console.log('--- Step 3: WIP Assembly ---');
    await page.goto(`${BASE_URL}/?view=wip`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    markCue(
      'wip_assembly',
      '03',
      '06',
      'PRODUCTION LINE',
      '⚙️',
      'WIP Assembly & Production Runs',
      'Automated BOM inventory deduction per battery pack in real-time',
      620,
      380,
      1.25
    );

    await smoothMouseMove(page, mouseX, mouseY, 620, 380, 25);
    mouseX = 620; mouseY = 380;
    await page.waitForTimeout(2000);

    // Scroll through production batches
    await page.evaluate(() => window.scrollBy({ top: 220, behavior: 'smooth' }));
    await page.waitForTimeout(2500);

    // ==========================================
    // 4. LIVE BOM COSTING ENGINE
    // ==========================================
    console.log('--- Step 4: BOM Cost Calculator & Margins ---');
    await page.goto(`${BASE_URL}/?view=finance_costing`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    markCue(
      'bom_costing',
      '04',
      '06',
      'FINANCIAL ENGINE',
      '🧮',
      'Live BOM Costing & Margin Engine',
      'Instant raw material cost roll-up, dealer & retail margin tiers with GST',
      960,
      460,
      1.26
    );

    // Hover recipe selector
    await smoothMouseMove(page, mouseX, mouseY, 400, 280, 25);
    mouseX = 400; mouseY = 280;
    await page.waitForTimeout(1800);

    // Hover over component costing table
    await smoothMouseMove(page, mouseX, mouseY, 850, 420, 30);
    mouseX = 850; mouseY = 420;
    await page.waitForTimeout(2200);

    // Hover over Margin & Pricing Tiers (Retail, Dealer, GST)
    await smoothMouseMove(page, mouseX, mouseY, 1150, 560, 30);
    mouseX = 1150; mouseY = 560;
    await page.waitForTimeout(3500);

    // ==========================================
    // 5. FINISHED GOODS & SERIAL TRACEABILITY
    // ==========================================
    console.log('--- Step 5: Finished Goods & Traceability ---');
    await page.goto(`${BASE_URL}/?view=finished`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    markCue(
      'finished_goods',
      '05',
      '06',
      'FINISHED GOODS',
      '📦',
      'Finished Goods & Serial Traceability',
      'End-to-end genealogy search from raw cell serial to finished pack',
      680,
      420,
      1.22
    );

    await smoothMouseMove(page, mouseX, mouseY, 680, 420, 25);
    mouseX = 680; mouseY = 420;
    await page.waitForTimeout(2500);

    // Jump to Master Traceability search
    await page.goto(`${BASE_URL}/?view=master`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    await smoothMouseMove(page, mouseX, mouseY, 550, 250, 25);
    mouseX = 550; mouseY = 250;
    await page.waitForTimeout(2500);

    // ==========================================
    // 6. COMMERCIAL ERP SUITE
    // ==========================================
    console.log('--- Step 6: Commercial ERP Operations ---');
    await page.goto(`${BASE_URL}/?view=finance_maker`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    markCue(
      'commercial_erp',
      '06',
      '06',
      'PLANT ERP',
      '💼',
      'Complete Plant ERP Operations',
      'GST Invoice Maker, Supplier Directory, Tasks & Expenses',
      960,
      520,
      1.20
    );

    await smoothMouseMove(page, mouseX, mouseY, 960, 520, 25);
    mouseX = 960; mouseY = 520;
    await page.waitForTimeout(2500);

    // Quick tour: Supplier Directory
    await page.goto(`${BASE_URL}/?view=companies`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    await smoothMouseMove(page, mouseX, mouseY, 500, 350, 20);
    mouseX = 500; mouseY = 350;
    await page.waitForTimeout(2200);

    // Quick tour: Employee Tasks
    await page.goto(`${BASE_URL}/?view=employee_tasks`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    await smoothMouseMove(page, mouseX, mouseY, 600, 380, 20);
    mouseX = 600; mouseY = 380;
    await page.waitForTimeout(2200);

    // Return to main Dashboard for Outro
    await page.goto(`${BASE_URL}/?view=home`, { waitUntil: 'networkidle' });
    await injectCursor(page);
    markCue(
      'outro',
      '',
      '',
      'OUTRO',
      '⚡',
      'Datlion Cnergy Plant OS',
      'The Operating System for Battery Manufacturers',
      960,
      540,
      1.0
    );
    await smoothMouseMove(page, mouseX, mouseY, 960, 540, 25);
    mouseX = 960; mouseY = 540;
    await page.waitForTimeout(4000);

  } catch (err) {
    console.error('Recording encountered an error:', err);
  } finally {
    const totalDuration = (Date.now() - startTime) / 1000;
    if (cues.length > 0) {
      cues[cues.length - 1].endSec = totalDuration;
    }
    console.log(`✅ Recording finished. Total length: ${totalDuration.toFixed(1)}s`);

    // Write timestamps cue sheet
    fs.writeFileSync(
      path.join(RECORDINGS_DIR, 'timestamps.json'),
      JSON.stringify({ totalDuration, cues }, null, 2)
    );

    // Close page and browser to finalize video
    const videoObj = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (videoObj) {
      const rawPath = await videoObj.path();
      const targetPath = path.join(RECORDINGS_DIR, 'raw-showcase.webm');
      try {
        fs.copyFileSync(rawPath, targetPath);
        console.log(`📹 Video saved successfully to: ${targetPath}`);
      } catch (e) {
        console.log(`📹 Video saved at: ${rawPath}`);
      }
    }
  }
}

record();
