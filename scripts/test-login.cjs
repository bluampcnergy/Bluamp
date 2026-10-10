const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.fill('#username', 'indrajeet.date@cnergy.co.in');
  await page.fill('#password', 'thisisbusiness');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log('Logged in successfully.');
  
  await page.goto('http://localhost:3000/?view=received');
  await page.waitForTimeout(3000);
  const text = await page.evaluate(() => document.body.innerText.substring(0, 300));
  console.log('Received goods view text:\n', text.replace(/\n+/g, ' '));
  await browser.close();
})();
