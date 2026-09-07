const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const context = await chromium.launchPersistentContext(path.join(__dirname, 'browser-data'), { headless: true, viewport: { width: 1400, height: 900 }, args: ['--disable-blink-features=AutomationControlled'] });
  context.on('page', p => console.log('page opened', p.url()));
  await new Promise(r => setTimeout(r, 1500));
  const page = await context.newPage();
  page.on('close', () => console.log('page closed'));
  try {
    await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('after goto', page.url());
    await new Promise(r => setTimeout(r, 8000));
    console.log('pages:', context.pages().map(p => p.url()));
    await page.screenshot({ path: '/tmp/suno-probe.png' });
    console.log('title', await page.title());
  } catch (e) { console.log('ERR', e.message.slice(0, 200)); console.log('pages now:', context.pages().map(p => p.url())); }
  await context.close();
})();
