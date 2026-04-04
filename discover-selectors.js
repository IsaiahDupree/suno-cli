/**
 * Phase 1: Discover selectors on suno.com/create
 * Launches a visible browser so you can log in manually,
 * then inspects the page to find track elements, 3-dot menus, and download options.
 * Saves results to selectors-report.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = path.join(__dirname, 'browser-data');
const REPORT_FILE = path.join(__dirname, 'selectors-report.json');

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to suno.com/create...');
  await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Give user time to log in if needed
  console.log('\n=== If you need to log in, do so now in the browser window. ===');
  console.log('Waiting 15 seconds for the page to fully load...\n');
  await page.waitForTimeout(15000);

  const report = { url: page.url(), timestamp: new Date().toISOString(), selectors: {} };

  // --- Discover track/song elements ---
  console.log('--- Searching for track/song elements ---');
  const trackSelectors = [
    // Common patterns for track lists
    '[data-testid*="song"]', '[data-testid*="track"]', '[data-testid*="creation"]',
    '[class*="song"]', '[class*="track"]', '[class*="creation"]',
    '[class*="Song"]', '[class*="Track"]', '[class*="Creation"]',
    '[class*="queue"]', '[class*="Queue"]',
    '[class*="playlist"]', '[class*="Playlist"]',
    'audio', 'video',
    '[role="listitem"]', '[role="row"]',
    '[class*="card"]', '[class*="Card"]',
    '[class*="item"]', '[class*="Item"]',
  ];

  for (const sel of trackSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      console.log(`  Found ${count} elements matching: ${sel}`);
      report.selectors[sel] = { count, type: 'track-candidate' };
      // Get first element's tag, classes, and text preview
      try {
        const info = await page.locator(sel).first().evaluate(el => ({
          tag: el.tagName,
          classes: el.className,
          id: el.id,
          textPreview: el.textContent?.slice(0, 100),
          children: el.children.length,
        }));
        report.selectors[sel].sample = info;
      } catch (e) {}
    }
  }

  // --- Discover 3-dot / more / menu buttons ---
  console.log('\n--- Searching for 3-dot/menu buttons ---');
  const menuSelectors = [
    '[aria-label*="more"]', '[aria-label*="More"]', '[aria-label*="menu"]', '[aria-label*="Menu"]',
    '[aria-label*="option"]', '[aria-label*="Option"]', '[aria-label*="action"]', '[aria-label*="Action"]',
    '[data-testid*="more"]', '[data-testid*="menu"]', '[data-testid*="option"]', '[data-testid*="action"]',
    '[class*="more"]', '[class*="More"]', '[class*="menu"]', '[class*="Menu"]',
    '[class*="kebab"]', '[class*="Kebab"]', '[class*="dots"]', '[class*="Dots"]',
    '[class*="ellipsis"]', '[class*="Ellipsis"]', '[class*="overflow"]', '[class*="Overflow"]',
    'button svg[class*="dots"]', 'button svg[class*="more"]',
    'button:has(svg)', // generic buttons with icons
  ];

  for (const sel of menuSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      console.log(`  Found ${count} elements matching: ${sel}`);
      report.selectors[sel] = { count, type: 'menu-candidate' };
      try {
        const info = await page.locator(sel).first().evaluate(el => ({
          tag: el.tagName,
          classes: el.className,
          id: el.id,
          ariaLabel: el.getAttribute('aria-label'),
          title: el.getAttribute('title'),
          textPreview: el.textContent?.slice(0, 80),
          innerHTML: el.innerHTML?.slice(0, 200),
        }));
        report.selectors[sel].sample = info;
      } catch (e) {}
    }
  }

  // --- Try clicking a 3-dot menu to discover download options ---
  console.log('\n--- Attempting to click a 3-dot menu to discover download options ---');
  const potentialMenuButtons = [
    '[aria-label*="more"]', '[aria-label*="More"]',
    '[data-testid*="more"]', '[class*="ellipsis"]',
    '[class*="dots"]', '[class*="kebab"]',
  ];

  let menuOpened = false;
  for (const sel of potentialMenuButtons) {
    const count = await page.locator(sel).count();
    if (count > 0) {
      try {
        await page.locator(sel).first().click();
        await page.waitForTimeout(2000);
        menuOpened = true;
        console.log(`  Clicked: ${sel}`);
        break;
      } catch (e) {
        console.log(`  Failed to click: ${sel}`);
      }
    }
  }

  if (menuOpened) {
    // Look for dropdown/popover/menu that appeared
    const dropdownSelectors = [
      '[role="menu"]', '[role="menuitem"]', '[role="listbox"]', '[role="option"]',
      '[class*="dropdown"]', '[class*="Dropdown"]', '[class*="popover"]', '[class*="Popover"]',
      '[class*="menu"]', '[class*="Menu"]', '[class*="context"]', '[class*="Context"]',
      '[data-radix-menu-content]', '[data-radix-popper-content-wrapper]',
      '[class*="radix"]', '[data-state="open"]',
    ];

    for (const sel of dropdownSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`  Dropdown element found: ${sel} (${count} matches)`);
        report.selectors[sel] = { count, type: 'dropdown-candidate' };
        try {
          const items = await page.locator(sel).allTextContents();
          report.selectors[sel].texts = items.map(t => t.slice(0, 200));
          console.log(`    Text content: ${items.map(t => t.slice(0, 80)).join(' | ')}`);
        } catch (e) {}
      }
    }

    // Specifically look for download-related menu items
    const downloadSelectors = [
      'text=Download', 'text=download', 'text=WAV', 'text=wav',
      'text=MP3', 'text=mp3', 'text=Export', 'text=export',
      '[class*="download"]', '[class*="Download"]',
      'a[href*="download"]', 'button:has-text("Download")',
      'div:has-text("Download")', 'span:has-text("Download")',
    ];

    console.log('\n--- Searching for download options in menu ---');
    for (const sel of downloadSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`  Download option found: ${sel} (${count} matches)`);
        report.selectors[sel] = { count, type: 'download-candidate' };
        try {
          const info = await page.locator(sel).first().evaluate(el => ({
            tag: el.tagName,
            classes: el.className,
            textPreview: el.textContent?.slice(0, 100),
            href: el.getAttribute('href'),
          }));
          report.selectors[sel].sample = info;
        } catch (e) {}
      }
    }
  }

  // --- Full page DOM snapshot of interesting elements ---
  console.log('\n--- Taking broad DOM snapshot ---');
  const snapshot = await page.evaluate(() => {
    const result = {};
    // All buttons
    const buttons = document.querySelectorAll('button');
    result.totalButtons = buttons.length;
    result.buttonSamples = Array.from(buttons).slice(0, 30).map(b => ({
      classes: b.className?.slice(0, 150),
      ariaLabel: b.getAttribute('aria-label'),
      title: b.getAttribute('title'),
      text: b.textContent?.trim().slice(0, 80),
      dataTestId: b.getAttribute('data-testid'),
    }));

    // All links with download in href or text
    const links = document.querySelectorAll('a');
    result.downloadLinks = Array.from(links).filter(a =>
      (a.href && a.href.includes('download')) ||
      (a.textContent && a.textContent.toLowerCase().includes('download'))
    ).map(a => ({
      href: a.href,
      text: a.textContent?.trim().slice(0, 80),
      classes: a.className?.slice(0, 150),
    }));

    // All elements with "song" or "track" in data attributes
    const allEls = document.querySelectorAll('*');
    result.dataAttributes = [];
    for (const el of allEls) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-') &&
            (attr.value.includes('song') || attr.value.includes('track') || attr.value.includes('creation'))) {
          result.dataAttributes.push({
            tag: el.tagName,
            attr: attr.name,
            value: attr.value.slice(0, 100),
            classes: el.className?.toString().slice(0, 100),
          });
          if (result.dataAttributes.length > 20) break;
        }
      }
      if (result.dataAttributes.length > 20) break;
    }

    return result;
  });

  report.domSnapshot = snapshot;
  console.log(`  Total buttons: ${snapshot.totalButtons}`);
  console.log(`  Download links: ${snapshot.downloadLinks.length}`);
  console.log(`  Data attributes with song/track/creation: ${snapshot.dataAttributes.length}`);

  // Save report
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${REPORT_FILE}`);

  console.log('\n=== Discovery complete. Inspect the report, then close the browser to exit. ===');
  console.log('Press Ctrl+C or close the browser window to stop.\n');

  // Keep browser open for manual inspection
  await new Promise(() => {});
})();
