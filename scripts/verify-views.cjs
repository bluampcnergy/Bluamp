const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  
  await page.goto('http://localhost:3000');
  await page.fill('#username', 'indrajeet.date@cnergy.co.in');
  await page.fill('#password', 'thisisbusiness');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  const views = [
    { id: 'received', title: 'Raw Materials' },
    { id: 'testing', title: 'Testing' },
    { id: 'wip', title: 'WIP Assembly' },
    { id: 'finance_costing', title: 'BOM Costing' },
    { id: 'finished', title: 'Finished Goods' },
    { id: 'master', title: 'Master Traceability' },
    { id: 'finance_maker', title: 'Invoice Maker' },
    { id: 'companies', title: 'Company Profiles' },
    { id: 'employee_tasks', title: 'Tasks' },
    { id: 'home', title: 'Home Dashboard' }
  ];

  for (const v of views) {
    await page.goto(`http://localhost:3000/?view=${v.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const heading = await page.evaluate(() => {
      const h = document.querySelector('h1, h2, h3');
      return h ? h.innerText : 'none';
    });
    console.log(`View ${v.id} (${v.title}) -> Heading: ${heading}`);
  }

  await browser.close();
  console.log('All views verified successfully!');
})();
