/**
 * Suno.com — Download All Tracks as WAV
 *
 * Handles Suno's virtualized list (only ~25 DOM rows at a time) by:
 *   1. Reading visible clip-row elements to get clip IDs + titles
 *   2. Downloading each via: 3-dot → Download → WAV Audio → "Download File"
 *   3. Scrolling to reveal new tracks, repeat until end of list
 *
 * Options:
 *   --mp3              Download MP3 instead of WAV
 *   --search "query"   Type into workspace search box before downloading
 *   --filter "name"    Click a filter/sort button by name
 *   --limit N          Only download N tracks total
 *   --dry-run          Scroll and count all tracks, don't download
 *   --resume           Skip clips already saved in ./downloads/
 *
 * Examples:
 *   node download-all-wav.js
 *   node download-all-wav.js --search "porcelain"
 *   node download-all-wav.js --mp3 --limit 10
 *   node download-all-wav.js --resume
 *   node download-all-wav.js --dry-run
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || true;
}
const USE_MP3 = args.includes('--mp3');
const FORMAT = USE_MP3 ? 'MP3' : 'WAV';
const SEARCH_QUERY = getArg('--search');
const FILTER_NAME = getArg('--filter');
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit')) : Infinity;
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');

const USER_DATA_DIR = path.join(__dirname, 'browser-data');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const DOWNLOAD_TIMEOUT = 180000;

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function uniquePath(dir, name) {
  let savePath = path.join(dir, name);
  if (!fs.existsSync(savePath)) return savePath;
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let n = 1;
  while (fs.existsSync(savePath)) {
    savePath = path.join(dir, `${base} (${n})${ext}`);
    n++;
  }
  return savePath;
}

console.log(`
╔══════════════════════════════════════════╗
║       Suno Track Downloader              ║
╠══════════════════════════════════════════╣
║  Format:  ${FORMAT.padEnd(31)}║
║  Search:  ${(SEARCH_QUERY || '(none)').toString().slice(0, 31).padEnd(31)}║
║  Filter:  ${(FILTER_NAME || '(none)').toString().slice(0, 31).padEnd(31)}║
║  Limit:   ${(LIMIT === Infinity ? 'all' : String(LIMIT)).padEnd(31)}║
║  Resume:  ${String(RESUME).padEnd(31)}║
║  Dry run: ${String(DRY_RUN).padEnd(31)}║
║  Save to: ./downloads/                   ║
╚══════════════════════════════════════════╝
`);

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
    acceptDownloads: true,
  });

  const page = context.pages()[0] || await context.newPage();

  console.log('Navigating to suno.com/create...');
  await page.goto('https://suno.com/create', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Dismiss cookie banner
  const cookieBtn = page.locator('#onetrust-reject-all-handler');
  if (await cookieBtn.count() > 0) {
    await cookieBtn.click();
    console.log('Dismissed cookie banner.');
    await page.waitForTimeout(1000);
  }

  // === Apply search ===
  if (SEARCH_QUERY) {
    console.log(`Applying search: "${SEARCH_QUERY}"`);
    const searchInput = page.locator('input[placeholder*="earch"]');
    if (await searchInput.count() > 0) {
      await searchInput.first().click();
      await searchInput.first().fill(SEARCH_QUERY);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      console.log('Search applied.');
    } else {
      console.log('Search input not found on page.');
    }
  }

  // === Apply filter ===
  if (FILTER_NAME) {
    console.log(`Applying filter: "${FILTER_NAME}"`);
    const filtersToggle = page.locator('button:has-text("Filters")');
    if (await filtersToggle.count() > 0) {
      await filtersToggle.first().click();
      await page.waitForTimeout(1000);
    }
    const filterBtn = page.locator(`button:has-text("${FILTER_NAME}"), [role="option"]:has-text("${FILTER_NAME}")`);
    if (await filterBtn.count() > 0) {
      await filterBtn.first().click();
      console.log('Filter applied.');
    } else {
      console.log(`Warning: Filter "${FILTER_NAME}" not found.`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
  }

  // === Extract visible clip rows with IDs and titles ===
  async function getVisibleClips() {
    return await page.evaluate(() => {
      const rows = document.querySelectorAll('div.clip-row[data-testid="clip-row"]');
      return Array.from(rows).map(row => {
        // Get clip ID from the song link
        const link = row.querySelector('a[href*="/song/"]');
        const clipId = link ? link.href.match(/\/song\/([a-f0-9-]+)/)?.[1] : null;
        // Get title from first meaningful span
        const spans = row.querySelectorAll('span');
        let title = null;
        for (const s of spans) {
          const t = s.textContent?.trim();
          if (t && t.length > 2 && t.length < 100 && !t.includes('credits') &&
              !t.includes('Publish') && !t.includes('Remix') && t !== 'v5.5' &&
              !t.startsWith('My Voice') && !t.startsWith('v4') && !t.startsWith('v3')) {
            title = t;
            break;
          }
        }
        return { clipId, title };
      }).filter(c => c.clipId);
    });
  }

  // === Download one clip by clicking its row's 3-dot menu ===
  async function downloadClip(clipId) {
    // Use Playwright locator to find the 3-dot menu inside the clip row with this ID
    const menuBtn = page.locator(`div.clip-row:has(a[href*="${clipId}"]) button.context-menu-button[aria-label="More options"]`);
    if (await menuBtn.count() === 0) return { status: 'skip', reason: 'clip not in DOM' };

    await menuBtn.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await menuBtn.first().click();
    await page.waitForTimeout(1200);

    // Click "Download"
    const dlBtn = page.locator('button.context-menu-button:has-text("Download")');
    if (await dlBtn.count() === 0) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      return { status: 'skip', reason: 'no Download option' };
    }
    await dlBtn.first().click();
    await page.waitForTimeout(1200);

    // Click format
    const formatLabel = USE_MP3 ? 'MP3 Audio' : 'WAV Audio';
    const formatBtn = page.locator(`button:has-text("${formatLabel}")`);
    if (await formatBtn.count() === 0) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      return { status: 'skip', reason: `${formatLabel} not available` };
    }
    await formatBtn.first().click();
    await page.waitForTimeout(2000);

    // Wait for "Download File" confirmation
    const downloadFileBtn = page.locator('button:has-text("Download File")');
    try {
      await downloadFileBtn.first().waitFor({ state: 'visible', timeout: 30000 });
    } catch (e) {}

    if (await downloadFileBtn.count() > 0) {
      // Wait for preparation to complete
      for (let w = 0; w < 30; w++) {
        const disabled = await downloadFileBtn.first().isDisabled().catch(() => true);
        if (!disabled) break;
        await page.waitForTimeout(1000);
      }

      const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT });
      await downloadFileBtn.first().click();
      const download = await downloadPromise;

      const suggestedName = download.suggestedFilename();
      const savePath = uniquePath(DOWNLOAD_DIR, suggestedName);
      await download.saveAs(savePath);

      const fileSize = fs.statSync(savePath).size;
      const sizeMB = (fileSize / 1024 / 1024).toFixed(1);

      // Close dialog
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      return { status: 'ok', file: path.basename(savePath), sizeMB };
    }

    // Fallback: direct download
    try {
      const download = await page.waitForEvent('download', { timeout: 30000 });
      const suggestedName = download.suggestedFilename();
      const savePath = uniquePath(DOWNLOAD_DIR, suggestedName);
      await download.saveAs(savePath);
      const fileSize = fs.statSync(savePath).size;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      return { status: 'ok', file: path.basename(savePath), sizeMB: (fileSize / 1024 / 1024).toFixed(1) };
    } catch (e) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      return { status: 'fail', reason: 'no download triggered' };
    }
  }

  // === Main scroll-and-download loop ===
  console.log('\n=== Downloading tracks ===\n');

  const processedClipIds = new Set();
  // For --resume, load already-downloaded clip IDs from a manifest if it exists
  const manifestPath = path.join(DOWNLOAD_DIR, '.manifest.json');
  let manifest = {};
  if (RESUME && fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    for (const id of Object.keys(manifest)) processedClipIds.add(id);
    console.log(`Resuming: ${processedClipIds.size} clips already downloaded.\n`);
  }

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  let totalSeen = 0;
  let noNewCount = 0;
  const errors = [];

  while (downloaded + skipped < LIMIT || DRY_RUN) {
    const visibleClips = await getVisibleClips();
    let foundNew = false;

    for (const clip of visibleClips) {
      if (downloaded >= LIMIT && !DRY_RUN) break;
      if (processedClipIds.has(clip.clipId)) continue;

      processedClipIds.add(clip.clipId);
      totalSeen++;
      foundNew = true;
      const title = clip.title?.slice(0, 50) || clip.clipId.slice(0, 12);

      if (RESUME && manifest[clip.clipId]) {
        skipped++;
        console.log(`  [skip] "${title}" (already downloaded)`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [${totalSeen}] "${title}" (${clip.clipId})`);
        continue;
      }

      const label = `[${downloaded + 1}${LIMIT !== Infinity ? '/' + LIMIT : ''}]`;

      try {
        const result = await downloadClip(clip.clipId);

        if (result.status === 'ok') {
          console.log(`${label} ✓ ${result.file} (${result.sizeMB} MB)`);
          downloaded++;
          // Save to manifest for resume support
          manifest[clip.clipId] = { file: result.file, title: clip.title, date: new Date().toISOString() };
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        } else if (result.status === 'skip') {
          console.log(`${label} → "${title}" skipped: ${result.reason}`);
          skipped++;
        } else {
          console.log(`${label} ✗ "${title}" failed: ${result.reason}`);
          failed++;
          errors.push({ clipId: clip.clipId, title, reason: result.reason });
        }
      } catch (err) {
        const msg = err.message || '';
        console.log(`${label} ✗ "${title}" error: ${msg.slice(0, 100)}`);
        failed++;
        errors.push({ clipId: clip.clipId, title, reason: msg.slice(0, 200) });
        try {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } catch (e) {}
      }

      await page.waitForTimeout(500);
    }

    if (!foundNew) {
      noNewCount++;
      if (noNewCount >= 8) {
        console.log('\nReached end of track list (no new clips after 8 scrolls).');
        break;
      }
    } else {
      noNewCount = 0;
    }

    if (downloaded >= LIMIT && !DRY_RUN) break;

    // Scroll down to load more tracks
    await page.evaluate(() => {
      const scroller = document.querySelector('.clip-browser-list-scroller');
      if (scroller) scroller.scrollBy(0, 400);
    });
    await page.waitForTimeout(2500);
  }

  // === Summary ===
  const dlCount = DRY_RUN ? totalSeen : downloaded;
  console.log(`
╔══════════════════════════════════════════╗
║           Download Complete               ║
╠══════════════════════════════════════════╣
║  Format:      ${FORMAT.padEnd(27)}║
║  Downloaded:  ${String(dlCount).padEnd(27)}║
║  Failed:      ${String(failed).padEnd(27)}║
║  Skipped:     ${String(skipped).padEnd(27)}║
║  Total seen:  ${String(totalSeen).padEnd(27)}║
║  Saved to:    ./downloads/               ║
╚══════════════════════════════════════════╝
`);

  const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => !f.startsWith('.'));
  if (files.length > 0) {
    let totalSize = 0;
    for (const f of files) totalSize += fs.statSync(path.join(DOWNLOAD_DIR, f)).size;
    console.log(`Files in downloads/: ${files.length} (${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB total)`);
  }

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  ${e.clipId}: ${e.reason?.slice(0, 80)}`);
  }

  await context.close();
  process.exit(0);
})();
