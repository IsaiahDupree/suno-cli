/**
 * Download tracks from Suno — WAV or MP3.
 * Handles virtualized list scrolling, resume, search, filters.
 *
 * DOWNLOAD STRATEGIES (as of April 2026):
 *   1. Song detail page — navigate to /song/{id}, find download controls (supports WAV)
 *   2. CDN direct — https://cdn1.suno.ai/{id}.mp3 (MP3 only, no WAV)
 *   3. Context menu — 3-dot → Download → WAV Audio (BROKEN — Suno removed this submenu)
 *
 * The downloadOneClip() function now tries the song detail page first, then CDN,
 * then falls back to the old context menu approach as a last resort.
 */
const path = require('path');
const fs = require('fs');
const { navigateTo, waitForLogin } = require('./browser');
const { DOWNLOAD_DIR, uniquePath } = require('./utils');
const { verifyAudioFile } = require('./verifier');
const { downloadTrack } = require('./download-strategies');

const DOWNLOAD_TIMEOUT = 180000;

async function getVisibleClips(page) {
  return await page.evaluate(() => {
    // Try multiple selectors for clip rows
    let rows = document.querySelectorAll('div.clip-row[data-testid="clip-row"]');
    if (rows.length === 0) rows = document.querySelectorAll('div.clip-row');
    if (rows.length === 0) rows = document.querySelectorAll('[class*="clip-row"]');

    return Array.from(rows).map(row => {
      const link = row.querySelector('a[href*="/song/"]');
      const clipId = link ? link.href.match(/\/song\/([a-f0-9-]+)/)?.[1] : null;
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

async function downloadOneClip(page, clipId, format, clipMetadata = {}) {
  // --- Strategy 1: Multi-strategy download (song page + CDN) ---
  const result = await downloadTrack(page, clipId, DOWNLOAD_DIR, {
    format,
    title: clipMetadata.title || '',
  });

  if (result.status === 'ok') {
    // Save metadata alongside audio
    saveMetadata(result.path, {
      ...clipMetadata,
      clipId,
      format: result.format,
      downloadedAt: new Date().toISOString(),
      fileSizeBytes: fs.statSync(result.path).size,
      method: result.method,
    });
    return {
      status: 'ok',
      file: result.file,
      sizeMB: result.sizeMB,
      verified: result.verified,
      method: result.method,
    };
  }

  // --- Strategy 2: Legacy context menu (likely BROKEN, kept as last resort) ---
  console.log('    Trying legacy context menu (likely broken)...');
  const currentUrl = page.url();
  if (!currentUrl.includes('/create')) {
    await navigateTo(page, '/create');
    await page.waitForTimeout(2000);
  }

  const menuBtn = page.locator(`div.clip-row:has(a[href*="${clipId}"]) button.context-menu-button[aria-label="More options"]`);
  if (await menuBtn.count() === 0) return { status: 'fail', reason: 'all strategies failed (clip not in DOM for context menu)' };

  await menuBtn.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await menuBtn.first().click();
  await page.waitForTimeout(1200);

  const dlBtn = page.locator('button.context-menu-button:has-text("Download")');
  if (await dlBtn.count() === 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    return { status: 'fail', reason: 'all strategies failed (no Download in context menu)' };
  }
  await dlBtn.first().click();
  await page.waitForTimeout(1200);

  const USE_MP3 = format === 'mp3';
  const formatLabel = USE_MP3 ? 'MP3 Audio' : 'WAV Audio';
  const formatBtn = page.locator(`button:has-text("${formatLabel}")`);
  if (await formatBtn.count() === 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    return { status: 'fail', reason: `all strategies failed (${formatLabel} not in context menu)` };
  }
  await formatBtn.first().click();
  await page.waitForTimeout(2000);

  const downloadFileBtn = page.locator('button:has-text("Download File")');
  try {
    await downloadFileBtn.first().waitFor({ state: 'visible', timeout: 30000 });
  } catch (e) {}

  if (await downloadFileBtn.count() > 0) {
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

    saveMetadata(savePath, { ...clipMetadata, clipId, format, downloadedAt: new Date().toISOString(), fileSizeBytes: fileSize });

    const verifyResult = verifyAudioFile(savePath, format);
    if (!verifyResult.valid) {
      console.warn(`    Verification failed for ${path.basename(savePath)}`);
      if (verifyResult.errors) {
        verifyResult.errors.forEach(e => console.warn(`     ${e}`));
      }
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return { status: 'ok', file: path.basename(savePath), sizeMB, verified: verifyResult.valid, method: 'context_menu' };
  }

  // Last resort: direct download event
  try {
    const download = await page.waitForEvent('download', { timeout: 30000 });
    const suggestedName = download.suggestedFilename();
    const savePath = uniquePath(DOWNLOAD_DIR, suggestedName);
    await download.saveAs(savePath);
    const fileSize = fs.statSync(savePath).size;

    saveMetadata(savePath, { ...clipMetadata, clipId, format, downloadedAt: new Date().toISOString(), fileSizeBytes: fileSize });

    const verifyResult = verifyAudioFile(savePath, format);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return { status: 'ok', file: path.basename(savePath), sizeMB: (fileSize / 1024 / 1024).toFixed(1), verified: verifyResult.valid, method: 'context_menu_fallback' };
  } catch (e) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return { status: 'fail', reason: 'all download strategies failed' };
  }
}

/**
 * Save metadata JSON file alongside audio file
 */
function saveMetadata(audioFilePath, metadata) {
  try {
    const ext = path.extname(audioFilePath);
    const baseName = audioFilePath.slice(0, -ext.length);
    const metadataPath = baseName + '.json';
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  } catch (err) {
    // Silently fail if metadata save fails, don't interrupt download
    console.error(`Warning: Could not save metadata: ${err.message}`);
  }
}

async function applySearch(page, query) {
  console.log(`Applying search: "${query}"`);
  const searchInput = page.locator('input[placeholder*="earch"]');
  if (await searchInput.count() > 0) {
    await searchInput.first().click();
    await searchInput.first().fill(query);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    console.log('Search applied.');
  } else {
    console.log('Search input not found.');
  }
}

async function applyFilter(page, filterName) {
  console.log(`Applying filter: "${filterName}"`);
  const filtersToggle = page.locator('button:has-text("Filters")');
  if (await filtersToggle.count() > 0) {
    await filtersToggle.first().click();
    await page.waitForTimeout(1000);
  }
  const filterBtn = page.locator(`button:has-text("${filterName}"), [role="option"]:has-text("${filterName}")`);
  if (await filterBtn.count() > 0) {
    await filterBtn.first().click();
    console.log('Filter applied.');
  } else {
    console.log(`Warning: Filter "${filterName}" not found.`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
}

async function runDownload(page, opts = {}) {
  const {
    format = 'wav',
    search = null,
    filter = null,
    limit = Infinity,
    dryRun = false,
    resume = false,
  } = opts;

  await navigateTo(page, '/create');
  await waitForLogin(page);

  if (search) await applySearch(page, search);
  if (filter) await applyFilter(page, filter);

  const manifestPath = path.join(DOWNLOAD_DIR, '.manifest.json');
  let manifest = {};
  const processedClipIds = new Set();

  if (resume && fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    for (const id of Object.keys(manifest)) processedClipIds.add(id);
    console.log(`Resuming: ${processedClipIds.size} clips already downloaded.\n`);
  }

  let downloaded = 0, failed = 0, skipped = 0, totalSeen = 0, noNewCount = 0;
  const errors = [];

  console.log(`\n=== Downloading tracks (${format.toUpperCase()}) ===\n`);

  while (downloaded + skipped < limit || dryRun) {
    const visibleClips = await getVisibleClips(page);
    let foundNew = false;

    for (const clip of visibleClips) {
      if (downloaded >= limit && !dryRun) break;
      if (processedClipIds.has(clip.clipId)) continue;

      processedClipIds.add(clip.clipId);
      totalSeen++;
      foundNew = true;
      const title = clip.title?.slice(0, 50) || clip.clipId.slice(0, 12);

      if (resume && manifest[clip.clipId]) {
        skipped++;
        console.log(`  [skip] "${title}" (already downloaded)`);
        continue;
      }

      if (dryRun) {
        console.log(`  [${totalSeen}] "${title}" (${clip.clipId})`);
        continue;
      }

      const label = `[${downloaded + 1}${limit !== Infinity ? '/' + limit : ''}]`;

      try {
        const result = await downloadOneClip(page, clip.clipId, format, { title: clip.title });
        if (result.status === 'ok') {
          console.log(`${label} ✓ ${result.file} (${result.sizeMB} MB)`);
          downloaded++;
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
        console.log(`${label} ✗ "${title}" error: ${(err.message || '').slice(0, 100)}`);
        failed++;
        errors.push({ clipId: clip.clipId, title, reason: (err.message || '').slice(0, 200) });
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(500); } catch (e) {}
      }

      await page.waitForTimeout(500);
    }

    if (!foundNew) {
      noNewCount++;
      if (noNewCount >= 8) {
        console.log('\nReached end of track list.');
        break;
      }
    } else {
      noNewCount = 0;
    }

    if (downloaded >= limit && !dryRun) break;

    await page.evaluate(() => {
      const scroller = document.querySelector('.clip-browser-list-scroller');
      if (scroller) scroller.scrollBy(0, 400);
    });
    await page.waitForTimeout(2500);
  }

  console.log(`\n=== Done: ${dryRun ? totalSeen + ' found' : downloaded + ' downloaded'}, ${failed} failed, ${skipped} skipped ===`);
  if (errors.length > 0) {
    console.log('Errors:');
    for (const e of errors) console.log(`  ${e.clipId}: ${e.reason?.slice(0, 80)}`);
  }

  return { downloaded, failed, skipped, totalSeen, errors };
}

module.exports = { runDownload, getVisibleClips, downloadOneClip };
