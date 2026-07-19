#!/usr/bin/env node
/**
 * Album Pipeline — Generate + Download + Verify, 1 album at a time.
 *
 * Reads a suno_prompts.json file, generates each track on Suno,
 * downloads audio (WAV preferred, MP3 fallback), verifies each file,
 * and writes a generation_progress.json with full status.
 *
 * Usage:
 *   node album-pipeline.js <suno_prompts.json> [options]
 *
 * Options:
 *   --voice "name"          Voice to use (default: "My Voice - Mar 29 _v2 obsidian")
 *   --no-voice              Don't select a voice
 *   --track N               Generate only track N (1-based)
 *   --from N                Resume from track N
 *   --download-only         Skip generation, only download for existing song IDs
 *   --verify-only           Skip generation+download, only verify existing files
 *   --format wav|mp3        Preferred download format (default: wav)
 *   --output-dir <dir>      Override output directory (default: same as prompts file)
 *   --dry-run               Show what would be done without doing it
 *
 * Examples:
 *   node album-pipeline.js ../output/albums/my-album/suno_prompts.json
 *   node album-pipeline.js ../output/albums/my-album/suno_prompts.json --track 3
 *   node album-pipeline.js ../output/albums/my-album/suno_prompts.json --from 8
 *   node album-pipeline.js ../output/albums/my-album/suno_prompts.json --download-only
 *   node album-pipeline.js ../output/albums/my-album/suno_prompts.json --verify-only
 */
const fs = require('fs');
const path = require('path');
const { launchBrowser, navigateTo, waitForLogin } = require('./lib/browser');
const { runCreate } = require('./lib/create');
const { downloadTrack, downloadCoverArt } = require('./lib/download-strategies');
const { verifyAudioFile } = require('./lib/verifier');

// --- Parse CLI args ---
const args = process.argv.slice(2);
const promptsFile = args.find(a => !a.startsWith('--'));
if (!promptsFile) {
  console.error('Usage: node album-pipeline.js <suno_prompts.json> [options]');
  process.exit(1);
}

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}
function hasFlag(name) { return args.includes(name); }

const VOICE = hasFlag('--no-voice') ? null : (getArg('--voice') || 'My Voice - Mar 29 _v2 obsidian');
const TRACK_ONLY = getArg('--track') ? parseInt(getArg('--track')) : null;
const FROM_TRACK = getArg('--from') ? parseInt(getArg('--from')) : 1;
const DOWNLOAD_ONLY = hasFlag('--download-only');
const VERIFY_ONLY = hasFlag('--verify-only');
const FORMAT = getArg('--format') || 'wav';
const DRY_RUN = hasFlag('--dry-run');

const promptsPath = path.resolve(promptsFile);
if (!fs.existsSync(promptsPath)) {
  console.error(`File not found: ${promptsPath}`);
  process.exit(1);
}

const OUTPUT_DIR = getArg('--output-dir') || path.dirname(promptsPath);
const DOWNLOADS_DIR = path.join(OUTPUT_DIR, 'downloads');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'generation_progress.json');

// --- Load prompts ---
const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
if (!Array.isArray(prompts) || prompts.length === 0) {
  console.error('suno_prompts.json must be a non-empty array');
  process.exit(1);
}

// --- Load or create progress ---
let progress = [];
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
}

// Ensure progress array has entries for all tracks
while (progress.length < prompts.length) {
  progress.push({ status: 'pending', song_ids: [], downloads: [] });
}

function saveProgress() {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// --- Determine which tracks to process ---
function getTrackRange() {
  if (TRACK_ONLY) return [TRACK_ONLY];
  const tracks = [];
  for (let i = FROM_TRACK; i <= prompts.length; i++) {
    tracks.push(i);
  }
  return tracks;
}

// --- Main pipeline ---
(async () => {
  const albumName = path.basename(OUTPUT_DIR);
  const totalTracks = prompts.length;
  const trackRange = getTrackRange();

  console.log(`
========================================
  Album Pipeline: ${albumName}
========================================
  Tracks: ${totalTracks} total, processing ${trackRange.length}
  Voice: ${VOICE || '(none)'}
  Format: ${FORMAT.toUpperCase()}
  Mode: ${VERIFY_ONLY ? 'VERIFY ONLY' : DOWNLOAD_ONLY ? 'DOWNLOAD ONLY' : 'GENERATE + DOWNLOAD'}
  Output: ${OUTPUT_DIR}
  ${DRY_RUN ? '*** DRY RUN — no changes will be made ***' : ''}
========================================
`);

  if (DRY_RUN) {
    for (const trackNum of trackRange) {
      const idx = trackNum - 1;
      const prompt = prompts[idx];
      const trackProgress = progress[idx];
      const status = trackProgress?.status || 'pending';
      const hasSongIds = (trackProgress?.song_ids || []).length > 0;
      const hasDownloads = (trackProgress?.downloads || []).filter(d => d.status === 'ok').length > 0;

      console.log(`  T${String(trackNum).padStart(2, '0')}: ${prompt.title || '(untitled)'}`);
      console.log(`        Status: ${status} | IDs: ${hasSongIds ? 'yes' : 'no'} | Downloaded: ${hasDownloads ? 'yes' : 'no'}`);
      console.log(`        Style: ${(prompt.style || prompt.style_of_music || '').slice(0, 60)}`);
    }
    process.exit(0);
  }

  // --- Verify-only mode ---
  if (VERIFY_ONLY) {
    console.log('Running verification on existing downloads...\n');
    let verified = 0, failed = 0, missing = 0;

    for (const trackNum of trackRange) {
      const idx = trackNum - 1;
      const trackProgress = progress[idx];
      const downloads = trackProgress?.downloads || [];

      if (downloads.length === 0) {
        console.log(`  T${String(trackNum).padStart(2, '0')}: no downloads`);
        missing++;
        continue;
      }

      for (const dl of downloads) {
        const filePath = dl.path || dl.wav_path || dl.audio_path;
        if (!filePath || !fs.existsSync(filePath)) {
          console.log(`  T${String(trackNum).padStart(2, '0')}: file missing — ${filePath || '(no path)'}`);
          missing++;
          continue;
        }

        const result = verifyAudioFile(filePath, dl.format || FORMAT);
        if (result.valid) {
          console.log(`  T${String(trackNum).padStart(2, '0')}: OK (${result.format.toUpperCase()}, ${result.sizeMB} MB)`);
          verified++;
        } else {
          console.log(`  T${String(trackNum).padStart(2, '0')}: FAIL — ${(result.errors || []).join(', ')}`);
          failed++;
        }
      }
    }

    console.log(`\n  Verified: ${verified} | Failed: ${failed} | Missing: ${missing}`);
    process.exit(failed > 0 ? 1 : 0);
  }

  // --- Launch browser ---
  console.log('Launching browser...');
  const { context, page } = await launchBrowser();

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  let generated = 0, downloaded = 0, failed = 0, skipped = 0;
  const errors = [];

  try {
    // Navigate to create page first for login check
    await navigateTo(page, '/create');
    await waitForLogin(page);

    // Check credits
    const credits = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label^="Credits remaining:"]');
      if (btn) {
        const match = btn.getAttribute('aria-label').match(/Credits remaining:\s*(\d+)/);
        return match ? parseInt(match[1]) : null;
      }
      return null;
    });
    if (credits !== null) {
      console.log(`Credits available: ${credits}`);
      if (!DOWNLOAD_ONLY && credits < trackRange.length * 10) {
        console.log(`WARNING: ${trackRange.length} tracks need ${trackRange.length * 10} credits, only ${credits} available`);
      }
    }

    // --- Process each track ---
    for (const trackNum of trackRange) {
      const idx = trackNum - 1;
      const prompt = prompts[idx];
      const trackProgress = progress[idx];
      const label = `T${String(trackNum).padStart(2, '0')}/${totalTracks}`;

      console.log(`\n--- ${label}: ${prompt.title || '(untitled)'} ---`);

      // --- Phase 1: Generate (unless download-only or already done) ---
      if (!DOWNLOAD_ONLY && trackProgress.status !== 'complete' && trackProgress.status !== 'generated') {
        console.log('  Phase 1: Generating on Suno...');

        // Make sure we're on /create
        const currentUrl = page.url();
        if (!currentUrl.includes('/create')) {
          await navigateTo(page, '/create');
          await page.waitForTimeout(2000);
        }

        const createResult = await runCreate(page, {
          lyrics: prompt.lyrics || prompt.prompt,
          style: prompt.style || prompt.style_of_music,
          title: prompt.title,
          voice: VOICE,
          model: prompt.model || null,
          format: FORMAT,
        });

        if (createResult.status === 'ok' && createResult.clipId) {
          console.log(`  Generated: ${createResult.clipId}`);

          // Grab both variations (Suno generates 2 per submission)
          await page.waitForTimeout(5000);
          const allClips = await page.evaluate(() => {
            const rows = document.querySelectorAll('div.clip-row a[href*="/song/"]');
            return Array.from(rows).map(a => a.href.match(/\/song\/([a-f0-9-]+)/)?.[1]).filter(Boolean);
          });

          // Take the newest 2 clips (they should be our new ones)
          const newIds = allClips.slice(0, 2);
          trackProgress.song_ids = newIds;
          trackProgress.selected_id = newIds[0];
          trackProgress.status = 'generated';
          trackProgress.title = prompt.title;
          trackProgress.generated_at = new Date().toISOString();
          generated++;
          saveProgress();
        } else {
          console.log(`  Generation failed: ${createResult.reason || 'unknown'}`);
          trackProgress.status = 'generation_failed';
          trackProgress.error = createResult.reason;
          failed++;
          errors.push({ track: trackNum, title: prompt.title, phase: 'generate', reason: createResult.reason });
          saveProgress();
          continue;
        }
      } else if (!DOWNLOAD_ONLY) {
        console.log(`  Phase 1: Already generated (${(trackProgress.song_ids || []).length} variations)`);
        skipped++;
      }

      // --- Phase 2: Download ---
      const songIds = trackProgress.song_ids || [];
      if (songIds.length === 0) {
        console.log('  Phase 2: No song IDs — skipping download');
        continue;
      }

      // Download the selected variation (or first one)
      const selectedId = trackProgress.selected_id || songIds[0];
      const existingDownloads = trackProgress.downloads || [];
      const alreadyDownloaded = existingDownloads.find(d => d.song_id === selectedId && d.status === 'ok');

      if (alreadyDownloaded && fs.existsSync(alreadyDownloaded.path)) {
        console.log(`  Phase 2: Already downloaded — ${alreadyDownloaded.file}`);
      } else {
        console.log(`  Phase 2: Downloading ${selectedId.slice(0, 8)}...`);

        const dlResult = await downloadTrack(page, selectedId, DOWNLOADS_DIR, {
          format: FORMAT,
          title: prompt.title,
        });

        if (dlResult.status === 'ok') {
          // Update progress
          const dlEntry = {
            song_id: selectedId,
            status: 'ok',
            file: dlResult.file,
            path: dlResult.path,
            format: dlResult.format,
            sizeMB: dlResult.sizeMB,
            method: dlResult.method,
            verified: dlResult.verified,
            downloaded_at: new Date().toISOString(),
          };

          // Replace or add download entry
          const existIdx = existingDownloads.findIndex(d => d.song_id === selectedId);
          if (existIdx >= 0) {
            existingDownloads[existIdx] = dlEntry;
          } else {
            existingDownloads.push(dlEntry);
          }
          trackProgress.downloads = existingDownloads;
          trackProgress.status = 'complete';
          downloaded++;
          saveProgress();

          console.log(`  Downloaded: ${dlResult.file} (${dlResult.sizeMB} MB, ${dlResult.format.toUpperCase()}, ${dlResult.method})`);

          // Download cover art too
          const artResult = await downloadCoverArt(selectedId, DOWNLOADS_DIR);
          if (artResult.status === 'ok') {
            trackProgress.cover_art = artResult.path;
            saveProgress();
          }
        } else {
          console.log(`  Download FAILED: ${dlResult.reason}`);
          failed++;
          errors.push({ track: trackNum, title: prompt.title, phase: 'download', reason: dlResult.reason });
        }
      }

      // --- Phase 3: Verify ---
      const finalDownload = (trackProgress.downloads || []).find(d => d.song_id === selectedId && d.status === 'ok');
      if (finalDownload && fs.existsSync(finalDownload.path)) {
        const verify = verifyAudioFile(finalDownload.path, finalDownload.format || FORMAT);
        if (verify.valid) {
          console.log(`  Verified: OK (${verify.format.toUpperCase()}, ${verify.sizeMB} MB)`);
        } else {
          console.log(`  Verification FAILED: ${(verify.errors || []).join(', ')}`);
          finalDownload.verified = false;
          saveProgress();
        }
      }

      // Brief pause between tracks
      await page.waitForTimeout(2000);
    }

  } catch (err) {
    console.error(`\nFATAL ERROR: ${err.message}`);
    console.error(err.stack);
  } finally {
    // --- Summary ---
    console.log(`
========================================
  Pipeline Complete: ${albumName}
========================================
  Generated: ${generated}
  Downloaded: ${downloaded}
  Skipped: ${skipped}
  Failed: ${failed}
========================================`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      for (const e of errors) {
        console.log(`  T${String(e.track).padStart(2, '0')} [${e.phase}]: ${e.reason}`);
      }
    }

    // Verification summary
    let verifiedCount = 0, unverifiedCount = 0, formatBreakdown = {};
    for (const tp of progress) {
      for (const dl of (tp.downloads || [])) {
        if (dl.status === 'ok') {
          const fmt = (dl.format || 'unknown').toUpperCase();
          formatBreakdown[fmt] = (formatBreakdown[fmt] || 0) + 1;
          if (dl.verified) verifiedCount++;
          else unverifiedCount++;
        }
      }
    }
    if (verifiedCount + unverifiedCount > 0) {
      console.log(`\nVerification: ${verifiedCount} passed, ${unverifiedCount} failed`);
      console.log(`Formats: ${Object.entries(formatBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    }

    // WAV-only warning
    if (FORMAT === 'wav' && formatBreakdown['MP3'] > 0 && !formatBreakdown['WAV']) {
      console.log('\nWARNING: Requested WAV but only got MP3.');
      console.log('WAV download via context menu is currently broken on Suno (April 2026).');
      console.log('Song detail page approach was tried first — check if you have Pro/Premier.');
    }

    saveProgress();
    await context.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
