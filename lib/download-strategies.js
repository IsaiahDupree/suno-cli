/**
 * Multi-strategy download module for Suno tracks.
 *
 * Strategies (tried in order):
 *   1. Song detail page — navigate to /song/{id}, find download button
 *   2. Network intercept — capture presigned WAV URLs from API responses
 *   3. CDN direct — https://cdn1.suno.ai/{id}.mp3 (MP3/M4A only, no WAV)
 *
 * The old context menu approach (3-dot → Download → WAV Audio) is BROKEN
 * as of April 2026 — Suno removed the Download submenu.
 */
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { navigateTo } = require('./browser');
const { uniquePath } = require('./utils');
const { verifyAudioFile } = require('./verifier');

const CDN_BASE = 'https://cdn1.suno.ai';

/**
 * Download a track using the song detail page.
 * Navigates to /song/{id}, looks for download controls, intercepts WAV URL.
 *
 * @param {import('playwright').Page} page
 * @param {string} songId
 * @param {string} outputDir
 * @param {string} format - 'wav' or 'mp3'
 * @returns {Promise<{status: string, file?: string, sizeMB?: string, format?: string, reason?: string}>}
 */
async function downloadViaSongPage(page, songId, outputDir, format = 'wav') {
  const songUrl = `https://suno.com/song/${songId}`;

  // Install network interceptor BEFORE navigating
  const capturedUrls = [];
  const responseHandler = async (response) => {
    const url = response.url();
    const headers = response.headers();
    const ct = headers['content-type'] || '';
    const cd = headers['content-disposition'] || '';

    // Capture audio URLs and API responses with download info
    if (ct.includes('audio') || cd.includes('attachment') ||
        url.includes('.wav') || url.includes('presign') ||
        url.includes('download') || url.includes('audio_url')) {
      capturedUrls.push({
        url,
        contentType: ct,
        contentDisposition: cd,
        status: response.status(),
      });
    }

    // Also check JSON API responses for download URLs
    if (ct.includes('json') && (url.includes('/api/') || url.includes('suno'))) {
      try {
        const body = await response.text();
        if (body.includes('.wav') || body.includes('download_url') ||
            body.includes('audio_url') || body.includes('presign')) {
          capturedUrls.push({
            url,
            contentType: ct,
            body: body.slice(0, 2000),
            status: response.status(),
            isApi: true,
          });
        }
      } catch (e) {
        // Response may have been consumed already
      }
    }
  };

  page.on('response', responseHandler);

  // Also capture download events
  let downloadTriggered = null;
  const downloadHandler = (download) => {
    downloadTriggered = download;
  };
  page.on('download', downloadHandler);

  try {
    // Navigate to song detail page
    await page.goto(songUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Strategy A: Look for a download button on the song page
    const downloadSelectors = [
      'button:has-text("Download")',
      'a:has-text("Download")',
      'button[aria-label*="download" i]',
      'button[aria-label*="Download"]',
      '[data-testid*="download" i]',
    ];

    let downloadBtnFound = false;
    for (const sel of downloadSelectors) {
      const btn = page.locator(sel);
      if (await btn.count() > 0) {
        console.log(`    Found download element: ${sel}`);
        downloadBtnFound = true;

        // Click it
        await btn.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await btn.first().click();
        await page.waitForTimeout(2000);

        // Look for format selection (WAV/MP3)
        if (format === 'wav') {
          const wavBtn = page.locator('button:has-text("WAV"), button:has-text("wav"), button:has-text("Lossless")');
          if (await wavBtn.count() > 0) {
            await wavBtn.first().click();
            await page.waitForTimeout(2000);
          }
        }

        // Look for "Download File" confirmation button
        const confirmBtn = page.locator('button:has-text("Download File")');
        if (await confirmBtn.count() > 0) {
          // Wait for it to be enabled
          for (let i = 0; i < 30; i++) {
            const disabled = await confirmBtn.first().isDisabled().catch(() => true);
            if (!disabled) break;
            await page.waitForTimeout(1000);
          }

          const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
          await confirmBtn.first().click();
          const download = await downloadPromise;

          const suggestedName = download.suggestedFilename();
          const savePath = uniquePath(outputDir, suggestedName);
          await download.saveAs(savePath);

          const fileSize = fs.statSync(savePath).size;
          const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
          const detectedFormat = savePath.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3';

          return {
            status: 'ok',
            file: path.basename(savePath),
            path: savePath,
            sizeMB,
            format: detectedFormat,
            method: 'song_page_modal',
          };
        }

        // Maybe download was triggered directly
        if (downloadTriggered) {
          const suggestedName = downloadTriggered.suggestedFilename();
          const savePath = uniquePath(outputDir, suggestedName);
          await downloadTriggered.saveAs(savePath);
          const fileSize = fs.statSync(savePath).size;
          const detectedFormat = savePath.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3';

          return {
            status: 'ok',
            file: path.basename(savePath),
            path: savePath,
            sizeMB: (fileSize / 1024 / 1024).toFixed(1),
            format: detectedFormat,
            method: 'song_page_direct',
          };
        }

        break;
      }
    }

    // Strategy B: Try the "More menu contents" button on song detail page
    const moreMenu = page.locator('button[aria-label="More menu contents"]');
    if (await moreMenu.count() > 0) {
      await moreMenu.first().click();
      await page.waitForTimeout(1500);

      // Look for download option in the menu
      const menuDl = page.locator('button:has-text("Download"), [role="menuitem"]:has-text("Download")');
      if (await menuDl.count() > 0) {
        console.log('    Found Download in More menu');
        await menuDl.first().click();
        await page.waitForTimeout(2000);

        // Handle format selection + Download File button (same as above)
        if (format === 'wav') {
          const wavBtn = page.locator('button:has-text("WAV"), button:has-text("Lossless")');
          if (await wavBtn.count() > 0) {
            await wavBtn.first().click();
            await page.waitForTimeout(2000);
          }
        }

        const confirmBtn = page.locator('button:has-text("Download File")');
        if (await confirmBtn.count() > 0) {
          for (let i = 0; i < 30; i++) {
            const disabled = await confirmBtn.first().isDisabled().catch(() => true);
            if (!disabled) break;
            await page.waitForTimeout(1000);
          }

          const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
          await confirmBtn.first().click();
          const download = await downloadPromise;

          const suggestedName = download.suggestedFilename();
          const savePath = uniquePath(outputDir, suggestedName);
          await download.saveAs(savePath);
          const fileSize = fs.statSync(savePath).size;
          const detectedFormat = savePath.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3';

          return {
            status: 'ok',
            file: path.basename(savePath),
            path: savePath,
            sizeMB: (fileSize / 1024 / 1024).toFixed(1),
            format: detectedFormat,
            method: 'song_page_more_menu',
          };
        }

        if (downloadTriggered) {
          const suggestedName = downloadTriggered.suggestedFilename();
          const savePath = uniquePath(outputDir, suggestedName);
          await downloadTriggered.saveAs(savePath);
          const fileSize = fs.statSync(savePath).size;
          const detectedFormat = savePath.toLowerCase().endsWith('.wav') ? 'wav' : 'mp3';

          return {
            status: 'ok',
            file: path.basename(savePath),
            path: savePath,
            sizeMB: (fileSize / 1024 / 1024).toFixed(1),
            format: detectedFormat,
            method: 'song_page_more_menu_direct',
          };
        }
      }

      // Dismiss menu
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Strategy C: Check captured network responses for presigned WAV URLs
    for (const captured of capturedUrls) {
      if (captured.isApi && captured.body) {
        try {
          const data = JSON.parse(captured.body);
          // Look for WAV URLs in various possible locations
          const wavUrl = findWavUrl(data);
          if (wavUrl) {
            console.log(`    Found presigned WAV URL from API`);
            const savePath = path.join(outputDir, `${songId}.wav`);
            const downloaded = await downloadUrl(wavUrl, savePath);
            if (downloaded) {
              const fileSize = fs.statSync(savePath).size;
              return {
                status: 'ok',
                file: path.basename(savePath),
                path: savePath,
                sizeMB: (fileSize / 1024 / 1024).toFixed(1),
                format: 'wav',
                method: 'network_intercept',
              };
            }
          }
        } catch (e) {
          // Not valid JSON, skip
        }
      }
    }

    if (!downloadBtnFound) {
      return { status: 'skip', reason: 'no download button found on song page' };
    }

    return { status: 'skip', reason: 'download button found but no file received' };

  } finally {
    page.removeListener('response', responseHandler);
    page.removeListener('download', downloadHandler);
  }
}

/**
 * Download via CDN URL (MP3/M4A only — no WAV available via CDN).
 *
 * @param {string} songId
 * @param {string} outputDir
 * @returns {Promise<{status: string, file?: string, sizeMB?: string, format?: string, reason?: string}>}
 */
async function downloadViaCDN(songId, outputDir) {
  const cdnUrl = `${CDN_BASE}/${songId}.mp3`;
  const savePath = path.join(outputDir, `${songId}.mp3`);

  try {
    const success = await downloadUrl(cdnUrl, savePath);
    if (success) {
      const fileSize = fs.statSync(savePath).size;
      if (fileSize < 100000) {
        // Too small — likely a 403 error page
        fs.unlinkSync(savePath);
        return { status: 'fail', reason: 'CDN returned error (file too small)' };
      }
      return {
        status: 'ok',
        file: path.basename(savePath),
        path: savePath,
        sizeMB: (fileSize / 1024 / 1024).toFixed(1),
        format: 'mp3',
        method: 'cdn',
      };
    }
    return { status: 'fail', reason: 'CDN download failed' };
  } catch (e) {
    return { status: 'fail', reason: `CDN error: ${e.message}` };
  }
}

/**
 * Download cover art from CDN.
 *
 * @param {string} songId
 * @param {string} outputDir
 * @returns {Promise<{status: string, file?: string}>}
 */
async function downloadCoverArt(songId, outputDir) {
  const artUrl = `https://cdn2.suno.ai/image_large_${songId}.jpeg`;
  const savePath = path.join(outputDir, `${songId}_cover.jpeg`);

  try {
    const success = await downloadUrl(artUrl, savePath);
    if (success && fs.statSync(savePath).size > 1000) {
      return { status: 'ok', file: path.basename(savePath), path: savePath };
    }
    if (fs.existsSync(savePath)) fs.unlinkSync(savePath);
    return { status: 'fail', reason: 'cover art not available' };
  } catch (e) {
    return { status: 'fail', reason: e.message };
  }
}

/**
 * Multi-strategy download: tries song page first, then CDN fallback.
 *
 * @param {import('playwright').Page} page
 * @param {string} songId
 * @param {string} outputDir
 * @param {object} opts - { format, title, skipCDN }
 * @returns {Promise<object>}
 */
async function downloadTrack(page, songId, outputDir, opts = {}) {
  const { format = 'wav', title = '', skipCDN = false } = opts;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`  Downloading ${songId.slice(0, 8)}... (${title || 'untitled'})`);

  // Strategy 1: Song detail page (supports WAV)
  console.log('    Trying song detail page...');
  const pageResult = await downloadViaSongPage(page, songId, outputDir, format);
  if (pageResult.status === 'ok') {
    // Verify
    const verify = verifyAudioFile(pageResult.path, pageResult.format);
    pageResult.verified = verify.valid;
    if (!verify.valid) {
      console.warn(`    Verification warning: ${(verify.errors || []).join(', ')}`);
    }
    console.log(`    OK via ${pageResult.method} (${pageResult.sizeMB} MB, ${pageResult.format.toUpperCase()})`);
    return pageResult;
  }
  console.log(`    Song page: ${pageResult.reason}`);

  // Strategy 2: CDN (MP3 only)
  if (!skipCDN) {
    console.log('    Trying CDN (MP3)...');
    const cdnResult = await downloadViaCDN(songId, outputDir);
    if (cdnResult.status === 'ok') {
      const verify = verifyAudioFile(cdnResult.path, 'mp3');
      cdnResult.verified = verify.valid;
      if (!verify.valid) {
        console.warn(`    Verification warning: ${(verify.errors || []).join(', ')}`);
      }
      console.log(`    OK via CDN (${cdnResult.sizeMB} MB, MP3)`);
      if (format === 'wav') {
        console.log(`    WARNING: Wanted WAV but got MP3 — WAV download not available`);
      }
      return cdnResult;
    }
    console.log(`    CDN: ${cdnResult.reason}`);
  }

  return { status: 'fail', reason: 'all download strategies failed' };
}

// --- Helpers ---

/**
 * Search a JSON object tree for a .wav URL.
 */
function findWavUrl(obj, depth = 0) {
  if (depth > 5 || !obj) return null;
  if (typeof obj === 'string') {
    if (obj.includes('.wav') && (obj.startsWith('http') || obj.startsWith('//'))) {
      return obj.startsWith('//') ? 'https:' + obj : obj;
    }
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findWavUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    // Prioritize known key names
    for (const key of ['download_url', 'wav_url', 'audio_url', 'url', 'href']) {
      if (obj[key]) {
        const found = findWavUrl(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const key of Object.keys(obj)) {
      const found = findWavUrl(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Download a URL to a local file path.
 * @returns {Promise<boolean>} true if successful
 */
function downloadUrl(url, destPath) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      // Follow redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        resolve(downloadUrl(response.headers.location, destPath));
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        resolve(false);
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    }).on('error', () => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      resolve(false);
    });
  });
}

module.exports = {
  downloadViaSongPage,
  downloadViaCDN,
  downloadCoverArt,
  downloadTrack,
  downloadUrl,
  findWavUrl,
};
