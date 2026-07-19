#!/usr/bin/env node
/**
 * Probe current Suno UI to discover download controls.
 *
 * Run this to see what download options exist in the current Suno UI.
 * Results are saved to docs/ui-probe-results.json for reference.
 *
 * Usage:
 *   node probe-ui.js                    # Probe workspace (/create) + first song detail page
 *   node probe-ui.js --song-id <id>     # Probe a specific song's detail page
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const USER_DATA_DIR = path.join(__dirname, 'browser-data');
const args = process.argv.slice(2);
const SONG_ID = args.includes('--song-id') ? args[args.indexOf('--song-id') + 1] : null;

const results = {
  timestamp: new Date().toISOString(),
  workspace: {},
  songPage: {},
  contextMenu: {},
  networkCaptures: [],
};

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
    acceptDownloads: true,
  });

  const page = context.pages()[0] || await context.newPage();

  // Monitor network for download-related requests
  page.on('response', async (resp) => {
    const url = resp.url();
    const ct = resp.headers()['content-type'] || '';
    if (url.includes('download') || url.includes('presign') || ct.includes('audio')) {
      results.networkCaptures.push({
        url: url.slice(0, 300),
        status: resp.status(),
        contentType: ct,
      });
    }
  });

  console.log('=== Suno UI Probe ===\n');

  // --- Probe 1: Workspace (/create) ---
  console.log('--- Probing /create workspace ---');
  await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Dismiss cookie banner
  const cookieBtn = page.locator('#onetrust-reject-all-handler');
  if (await cookieBtn.count() > 0) await cookieBtn.click();

  // Get first song ID
  let firstSongId = SONG_ID;
  if (!firstSongId) {
    firstSongId = await page.evaluate(() => {
      const link = document.querySelector('a[href*="/song/"]');
      return link ? link.href.match(/\/song\/([a-f0-9-]+)/)?.[1] : null;
    });
  }
  results.workspace.firstSongId = firstSongId;
  console.log(`  First song ID: ${firstSongId || 'none found'}`);

  // --- Probe 2: Context menu on first song ---
  if (firstSongId) {
    console.log('\n--- Probing context menu ---');
    const menuBtn = page.locator(`div.clip-row:has(a[href*="${firstSongId}"]) button[aria-label="More options"]`);

    if (await menuBtn.count() > 0) {
      await menuBtn.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await menuBtn.first().click();
      await page.waitForTimeout(1500);

      // Capture ALL visible buttons/menu items
      const menuItems = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, [role="menuitem"], [role="option"]'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map(el => ({
            tag: el.tagName,
            text: el.textContent?.trim().slice(0, 100),
            ariaLabel: el.getAttribute('aria-label'),
            role: el.getAttribute('role'),
            classes: el.className?.toString().slice(0, 150),
            dataTestId: el.getAttribute('data-testid'),
          }))
          .filter(el => el.text && el.text.length > 0 && el.text.length < 100);
      });

      results.contextMenu.items = menuItems;
      console.log('  Context menu items:');
      for (const item of menuItems) {
        const label = item.ariaLabel ? ` [${item.ariaLabel}]` : '';
        console.log(`    "${item.text}"${label}`);
      }

      // Check specifically for Download
      const hasDownload = menuItems.some(i =>
        i.text.toLowerCase().includes('download') ||
        (i.ariaLabel || '').toLowerCase().includes('download')
      );
      results.contextMenu.hasDownload = hasDownload;
      console.log(`  Download option present: ${hasDownload ? 'YES' : 'NO'}`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.log('  No "More options" button found');
    }

    // --- Probe 3: Song detail page ---
    console.log(`\n--- Probing song detail page: /song/${firstSongId.slice(0, 8)}... ---`);
    await page.goto(`https://suno.com/song/${firstSongId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Find all interactive elements on the page
    const songPageElements = await page.evaluate(() => {
      const elements = [];

      // All buttons
      for (const btn of document.querySelectorAll('button')) {
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        elements.push({
          type: 'button',
          text: btn.textContent?.trim().slice(0, 100),
          ariaLabel: btn.getAttribute('aria-label'),
          classes: btn.className?.toString().slice(0, 150),
          dataTestId: btn.getAttribute('data-testid'),
        });
      }

      // All links
      for (const a of document.querySelectorAll('a')) {
        const rect = a.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const href = a.getAttribute('href') || '';
        if (href.includes('download') || a.textContent?.toLowerCase().includes('download')) {
          elements.push({
            type: 'link',
            text: a.textContent?.trim().slice(0, 100),
            href: href.slice(0, 200),
            ariaLabel: a.getAttribute('aria-label'),
          });
        }
      }

      return elements;
    });

    results.songPage.elements = songPageElements;

    // Filter for download-related elements
    const dlElements = songPageElements.filter(el =>
      (el.text || '').toLowerCase().includes('download') ||
      (el.ariaLabel || '').toLowerCase().includes('download') ||
      (el.href || '').toLowerCase().includes('download')
    );

    console.log(`  Total interactive elements: ${songPageElements.length}`);
    console.log('  Download-related elements:');
    if (dlElements.length > 0) {
      for (const el of dlElements) {
        console.log(`    [${el.type}] "${el.text}" ${el.ariaLabel ? `[${el.ariaLabel}]` : ''}`);
      }
    } else {
      console.log('    (none found)');
    }

    // List ALL buttons for reference
    console.log('  All visible buttons:');
    const buttons = songPageElements.filter(e => e.type === 'button' && e.text);
    for (const btn of buttons.slice(0, 30)) {
      const label = btn.ariaLabel ? ` [${btn.ariaLabel}]` : '';
      console.log(`    "${btn.text.slice(0, 60)}"${label}`);
    }

    // --- Probe 4: "More menu contents" on song page ---
    const moreMenu = page.locator('button[aria-label="More menu contents"]');
    if (await moreMenu.count() > 0) {
      console.log('\n  --- Opening "More menu contents" ---');
      await moreMenu.first().click();
      await page.waitForTimeout(1500);

      const moreItems = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, [role="menuitem"], [role="option"]'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map(el => ({
            text: el.textContent?.trim().slice(0, 100),
            ariaLabel: el.getAttribute('aria-label'),
            role: el.getAttribute('role'),
          }))
          .filter(el => el.text && el.text.length > 0 && el.text.length < 100);
      });

      results.songPage.moreMenuItems = moreItems;
      console.log('  "More menu" items:');
      for (const item of moreItems) {
        const label = item.ariaLabel ? ` [${item.ariaLabel}]` : '';
        console.log(`    "${item.text.slice(0, 60)}"${label}`);
      }

      const hasDownloadInMore = moreItems.some(i =>
        (i.text || '').toLowerCase().includes('download')
      );
      results.songPage.hasDownloadInMoreMenu = hasDownloadInMore;

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // --- Probe 5: Check for audio player controls ---
    console.log('\n  --- Checking audio player ---');
    const audioControls = await page.evaluate(() => {
      const controls = [];
      // Look for audio elements
      for (const audio of document.querySelectorAll('audio, video')) {
        controls.push({
          type: audio.tagName,
          src: audio.src?.slice(0, 200) || audio.querySelector('source')?.src?.slice(0, 200),
          controls: audio.controls,
        });
      }
      // Look for download attributes on any element
      for (const el of document.querySelectorAll('[download], a[download]')) {
        controls.push({
          type: 'download-attr',
          href: el.getAttribute('href')?.slice(0, 200),
          download: el.getAttribute('download'),
        });
      }
      return controls;
    });

    results.songPage.audioControls = audioControls;
    if (audioControls.length > 0) {
      console.log('  Audio/download elements:');
      for (const ctrl of audioControls) {
        console.log(`    [${ctrl.type}] src=${ctrl.src || ctrl.href || '(none)'}`);
      }
    } else {
      console.log('  No audio/download elements found');
    }
  }

  // --- Save results ---
  const outputPath = path.join(__dirname, 'docs', 'ui-probe-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n=== Results saved to ${outputPath} ===`);

  // --- Network captures ---
  if (results.networkCaptures.length > 0) {
    console.log('\nNetwork captures (download-related):');
    for (const cap of results.networkCaptures) {
      console.log(`  [${cap.status}] ${cap.url}`);
    }
  }

  console.log('\nBrowser will stay open for 10 seconds for manual inspection...');
  await page.waitForTimeout(10000);
  await context.close();
  process.exit(0);
})();
