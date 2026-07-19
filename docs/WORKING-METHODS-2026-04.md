# Suno Automation — Working Methods Reference
# Last verified: 2026-04-30

## STATUS SUMMARY

| Method | Status | Notes |
|--------|--------|-------|
| Song generation (create.js) | WORKING | Playwright + Chromium |
| Song generation (suno_safari.py) | WORKING | AppleScript + React injection |
| MP3 download via CDN | WORKING | Direct curl/https, no auth needed |
| M4A download via CDN | WORKING | Direct curl/https, no auth needed |
| Cover art via CDN | WORKING | `https://cdn2.suno.ai/image_large_{id}.jpeg` |
| Get song IDs from workspace | WORKING | Clip row parsing |
| Voice selection | WORKING | `aria-label="Add Voice"` |
| Credit monitoring | WORKING | `aria-label="Credits remaining:"` |
| Cookie banner dismiss | WORKING | Auto on first visit |
| WAV download via context menu | BROKEN | "Download" submenu REMOVED from 3-dot menu |
| WAV presigned URL intercept | BROKEN | Context menu trigger fails |
| Song detail page download | UNTESTED | New strategy — needs probe-ui.js run |

---

## SCRIPTS AND WHAT THEY DO

### album-pipeline.js (NEW — full album workflow)
```bash
# Generate + download + verify an entire album
node album-pipeline.js <suno_prompts.json>

# Generate with a specific voice
node album-pipeline.js <prompts.json> --voice "My Voice - Mar 29 _v2 obsidian"

# Resume from track 8
node album-pipeline.js <prompts.json> --from 8

# Only generate track 3
node album-pipeline.js <prompts.json> --track 3

# Download-only mode (for tracks already generated)
node album-pipeline.js <prompts.json> --download-only

# Verify-only mode (check existing downloads)
node album-pipeline.js <prompts.json> --verify-only

# Dry run (preview what would happen)
node album-pipeline.js <prompts.json> --dry-run
```

Pipeline flow per track:
1. **Generate** — fills lyrics, style, title, voice on /create → clicks Create → waits for completion
2. **Download** — tries song detail page first (WAV), falls back to CDN (MP3)
3. **Verify** — checks file signature (RIFF for WAV, ID3/sync for MP3) + size range
4. **Save** — writes `generation_progress.json` after each track

### suno-cli.js (individual commands)
```bash
node suno-cli.js create --lyrics "..." --style "dark pop" --title "Song" --voice "..."
node suno-cli.js download --format wav --limit 10
node suno-cli.js list --json
```

### probe-ui.js (NEW — discover current Suno UI)
```bash
# Probe workspace + first song detail page
node probe-ui.js

# Probe a specific song
node probe-ui.js --song-id <uuid>
```
Outputs: `docs/ui-probe-results.json`
**Run this first** to discover if Suno has new download controls.

### download-all-wav.js (LEGACY — context menu approach, BROKEN)
Old bulk downloader using 3-dot menu. Kept for reference but will NOT work.

---

## WHAT WORKS

### 1. Song Generation (album-pipeline.js or suno-cli.js create)
Uses Playwright + persistent Chromium context. Fills:
- Lyrics textarea: `data-testid="lyrics-textarea"`
- Style textarea: 2nd visible textarea (genre placeholder)
- Title input: `input[placeholder*="Song Title"]`
- Voice: `aria-label="Add Voice"` → modal → click voice name
- Create button: `aria-label="Create song"`

Generates 2 variations per submission (10 credits each).

Voice: "My Voice - Mar 29 _v2 obsidian" (persona 97cbf29c-0fb2-47d0-8e41-2ca226281774)

### 2. MP3/M4A Download via CDN
```bash
curl -sL -o song.mp3 "https://cdn1.suno.ai/{song_id}.mp3"
```
No authentication required. Works for recent songs.
Expires after songs age out (403 on old IDs — weeks).

### 3. Cover Art via CDN
```bash
curl -sL -o cover.jpeg "https://cdn2.suno.ai/image_large_{song_id}.jpeg"
```

### 4. Song ID Extraction
```javascript
const rows = document.querySelectorAll('div.clip-row a[href*="/song/"]');
// Returns UUIDs from href="/song/{id}"
```

### 5. Credit Balance Check
```javascript
const btn = document.querySelector('button[aria-label^="Credits remaining:"]');
// aria-label="Credits remaining: N"
```

---

## WHAT IS BROKEN (April 2026)

### WAV Download — Context Menu REMOVED
Previously: More options (...) → Download → WAV Audio → Download File modal

**Current Suno UI (v5.5, April 2026):** The "Download" submenu has been
removed from the More options context menu on the /create workspace page.

Affects:
- `download.js` — `downloadOneClip()` uses `button.context-menu-button:has-text("Download")`
- `download-all-wav.js` — same broken flow
- `suno_safari.py` — `download_wav_from_context_menu()` returns `DOWNLOAD_MENU_FAILED`

### Impact
- All WAV downloads fail through the old context menu path
- CDN only provides MP3/M4A — no WAV via CDN
- DistroKid upload policy is WAV-only

---

## DOWNLOAD STRATEGY (download-strategies.js)

Multi-strategy approach in priority order:

### Strategy 1: Song Detail Page
Navigate to `https://suno.com/song/{id}`, look for:
- Download buttons: `button:has-text("Download")`
- "More menu contents": `button[aria-label="More menu contents"]`
- Format selection: WAV/MP3 buttons
- "Download File" confirmation modal

Also intercepts network responses for presigned WAV URLs from API calls.

**Status: UNTESTED** — Run `node probe-ui.js` to discover what's available.

### Strategy 2: CDN Direct
- URL: `https://cdn1.suno.ai/{song_id}.mp3`
- Format: MP3 (sometimes M4A)
- No auth needed
- No WAV available

**Status: WORKING** — but only gives lossy formats.

### Strategy 3: Context Menu (LEGACY)
- Old 3-dot → Download → WAV Audio flow
- **BROKEN** — do not use

---

## SELECTOR MAP (as of April 2026)

### Create Page (/create)
- Lyrics textarea: `data-testid="lyrics-textarea"`
- Style textarea: 2nd textarea (genre placeholder)
- Title input: `input[placeholder*="Song Title"]`
- Create button: `aria-label="Create song"`
- Mode tabs: buttons "Simple" / "Advanced" / "Sounds"
- Voice picker: `aria-label="Add Voice"`
- Song rows: `data-testid="clip-row"` or `div.clip-row`
- More options: `button[aria-label="More options"]` (inside clip-row)
- Credit display: `button[aria-label^="Credits remaining:"]`

### Song Detail Page (/song/{id})
- Edit button: `aria-label="Edit Song Details"`
- Cover art download: `aria-label="Download Cover Image"`
- More menu: `aria-label="More menu contents"`

---

## VERIFICATION (verifier.js)

Checks:
1. **File signature** — RIFF header for WAV, ID3/frame sync for MP3
2. **Size range** — minimum 100KB, maximum 1GB
3. **Format match** — actual format matches expected format

```javascript
const { verifyAudioFile } = require('./lib/verifier');
const result = verifyAudioFile('/path/to/file.wav', 'wav');
// { valid: true, format: 'wav', sizeMB: '45.2' }
```

---

## DISTROKID RULES (enforced in Suno project code)

1. **WAV only** — upload_album() enforces .wav extension on all tasks
2. **No add-ons** — complete_post_submit() + skip_mixea() auto-decline all upsells
3. **No duplicate audio** — pre-flight dupe check aborts if any 2 tracks share a file

---

## NEXT STEPS

1. **Run `node probe-ui.js`** to discover current download UI on song detail page
2. If WAV download exists on song page, update `download-strategies.js` selectors
3. If WAV download is completely removed, explore Suno API endpoints for direct access
4. Test full album pipeline with `node album-pipeline.js --dry-run` first
