/**
 * Probe: Understand how Suno delivers WAV downloads
 * Monitors network requests, download events, and new tabs/popups.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const USER_DATA_DIR = path.join(__dirname, 'browser-data');

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
    acceptDownloads: true,
  });

  const page = context.pages()[0] || await context.newPage();

  // Monitor ALL network requests
  const downloadUrls = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('download') || url.includes('wav') || url.includes('audio') || url.includes('cdn')) {
      console.log(`  [REQUEST] ${req.method()} ${url.slice(0, 200)}`);
    }
  });

  page.on('response', async resp => {
    const url = resp.url();
    const ct = resp.headers()['content-type'] || '';
    const cd = resp.headers()['content-disposition'] || '';
    if (url.includes('download') || url.includes('wav') || ct.includes('audio') || cd.includes('attachment')) {
      console.log(`  [RESPONSE] ${resp.status()} ${url.slice(0, 200)}`);
      console.log(`    Content-Type: ${ct}`);
      console.log(`    Content-Disposition: ${cd}`);
      downloadUrls.push(url);
    }
  });

  // Monitor download events
  page.on('download', download => {
    console.log(`  [DOWNLOAD EVENT] ${download.suggestedFilename()} url=${download.url().slice(0, 200)}`);
  });

  // Monitor new pages/popups
  context.on('page', newPage => {
    console.log(`  [NEW PAGE] ${newPage.url()}`);
  });

  console.log('Navigating to suno.com/create...');
  await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Click the first 3-dot menu
  console.log('\n--- Clicking first 3-dot menu ---');
  const menuBtn = page.locator('button.context-menu-button[aria-label="More options"]').first();
  await menuBtn.scrollIntoViewIfNeeded();
  await menuBtn.click();
  await page.waitForTimeout(1500);

  // Take a snapshot of the menu that appeared
  console.log('\n--- Menu content ---');
  const menuItems = await page.locator('button.context-menu-button').allTextContents();
  console.log('Menu items:', menuItems.filter(t => t.trim()).join(' | '));

  // Click Download
  console.log('\n--- Clicking Download ---');
  const dlBtn = page.locator('button.context-menu-button:has-text("Download")');
  if (await dlBtn.count() > 0) {
    await dlBtn.first().click();
    await page.waitForTimeout(2000);

    // Snapshot whatever appeared
    console.log('\n--- After clicking Download ---');

    // Check for any dialog/modal/popover
    const openElements = await page.evaluate(() => {
      const results = [];
      // Check for dialogs
      for (const sel of ['[role="dialog"]', '[data-state="open"]', '[class*="modal"]', '[class*="Modal"]', '[class*="popover"]', '[class*="Popover"]', '[class*="overlay"]']) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          results.push({
            selector: sel,
            tag: el.tagName,
            classes: el.className?.toString().slice(0, 200),
            text: el.textContent?.slice(0, 500),
            html: el.innerHTML?.slice(0, 1000),
          });
        }
      }
      return results;
    });

    for (const el of openElements) {
      console.log(`\n  [${el.selector}] <${el.tag}>`);
      console.log(`  Classes: ${el.classes?.slice(0, 100)}`);
      console.log(`  Text: ${el.text?.slice(0, 300)}`);
    }

    // Look for WAV button and all buttons in the visible area
    console.log('\n--- Looking for WAV/format buttons ---');
    const allVisibleButtons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).filter(b => {
        const rect = b.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).map(b => ({
        text: b.textContent?.trim().slice(0, 100),
        classes: b.className?.slice(0, 150),
        ariaLabel: b.getAttribute('aria-label'),
        dataState: b.getAttribute('data-state'),
      })).filter(b => b.text);
    });

    console.log('Visible buttons with text:');
    for (const b of allVisibleButtons) {
      console.log(`  "${b.text}" [${b.ariaLabel || ''}] state=${b.dataState || ''}`);
    }

    // Try clicking WAV
    console.log('\n--- Attempting to click WAV ---');
    const wavBtn = page.locator('button:has-text("WAV")');
    if (await wavBtn.count() > 0) {
      console.log('Found WAV button, clicking...');
      await wavBtn.first().click();

      // Wait and watch for network activity
      console.log('Waiting 15 seconds for download activity...');
      await page.waitForTimeout(15000);
    } else {
      console.log('No WAV button found. Checking for other format options...');
      // Try text-based search
      for (const fmt of ['wav', 'WAV', 'mp3', 'MP3', 'Audio', 'Video', 'Stem', 'High', 'Lossless']) {
        const btn = page.locator(`button:has-text("${fmt}")`);
        const c = await btn.count();
        if (c > 0) {
          const txt = await btn.first().textContent();
          console.log(`  Found button with "${fmt}": "${txt}"`);
        }
      }
    }
  } else {
    console.log('No Download button found in menu!');
  }

  console.log('\n--- Download URLs captured ---');
  for (const u of downloadUrls) {
    console.log(`  ${u.slice(0, 300)}`);
  }

  console.log('\n--- Probe complete. Browser will stay open for 30 seconds for inspection ---');
  await page.waitForTimeout(30000);
  await context.close();
  process.exit(0);
})();
