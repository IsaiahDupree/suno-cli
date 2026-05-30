# AGENTS.md — suno-cli

> Agent entry doc for `/Users/isaiahdupree/Documents/Software/suno-cli`.
> Read this before touching anything in this repo. For the full three-repo
> picture (Suno Music Factory + suno-cli + SEOdocumentary), see
> **`/Users/isaiahdupree/Documents/Software/MUSIC-STACK.md`**.

---

## What this repo is

A **standalone Node.js / Playwright browser-automation tool for suno.com**.
It drives a persistent Chromium session (logged into Suno via the browser UI)
and exposes a CLI (`suno-cli.js`) with commands to `create`, `download`,
`list`, `delete`, `remix`, `extend`, `cover`, plus `config` and a `server`
mode. It was originally built as a full-featured, all-in-one Suno automation
surface.

## Its ONLY role in the music stack

In the larger Venom Valentine music stack, **suno-cli has exactly one live
responsibility: downloading generated WAV files.**

The canonical Music Factory at `/Users/isaiahdupree/Documents/Software/Suno`
generates and submits tracks with its own Python automation
(`main.py automate` → `automation/suno_safari.py`). The factory does **not**
use suno-cli to create music. It only shells out to suno-cli for the WAV
download step:

`Suno/factory/stages.py` → `stage_download()` runs:

```bash
node suno-cli.js download --format wav --output <out_dir> --resume
```

(from `SUNO_CLI_DIR = <repo-root>/../suno-cli`). DistroKid requires WAV, and
WAVs are only fetchable while the songs are still in the Suno workspace, so the
factory calls this immediately after submission. That single `download`
invocation is the entire contract between the factory and this repo.

> Note: the factory passes `--output <out_dir>`. The current `lib/download.js`
> does not read an `--output` flag — downloads land in `./downloads` (or
> `SUNO_DOWNLOADS_DIR`). Treat `--output` as effectively a no-op today; if you
> need files at a specific path, set `SUNO_DOWNLOADS_DIR` or move them after.

## Everything else here is ORPHANED / slated for retirement

The `create`, `remix`, `extend`, `cover`, `delete`, `batch`/`album-pipeline`,
`config`, `server` (REST), and `api` surfaces are **not reachable from the
factory** and are not part of any live pipeline. They overlap with — and have
been superseded by — the factory's own `automation/` code. They are kept only
as reference and are slated for removal.

The download path itself is **also** being retired: it is being replaced by
`Suno/automation/suno_wav_api.py`, which fetches WAVs over HTTP instead of
driving a browser. Once that replacement is wired into `stage_download()`,
this entire repo can be archived. **Do not invest in the orphaned surfaces.**
If asked to "improve suno-cli," confirm the work targets the download path or
the migration to `suno_wav_api.py` — otherwise it is almost certainly wasted.

---

## Setup

```bash
cd /Users/isaiahdupree/Documents/Software/suno-cli
npm install            # installs playwright + @supabase/supabase-js
```

- **Node:** any modern Node (developed/run on Node 25.x; no `engines` pin in
  `package.json`).
- **Browser session:** Playwright uses a persistent Chromium profile in
  `./browser-data/`. First run opens a window — log into suno.com once in that
  window; the session then persists across runs. To reset: `rm -rf browser-data/`.
- **Env:** copy `.env.example` → `.env.local`. Relevant for the live path:
  `SUNO_FORMAT` (wav/mp3, default wav), `SUNO_RESUME`, `SUNO_DOWNLOADS_DIR`.
  Do **not** commit real secrets (`SUPABASE_*`, etc.).

## The one command that matters

```bash
# Download all generated WAVs, skipping ones already downloaded.
node suno-cli.js download --format wav --resume

# Useful flags:
#   --format wav|mp3   audio format (default wav; the stack needs WAV)
#   --limit N          max tracks to download
#   --resume           skip already-downloaded tracks
#   --dry-run          list what would download without downloading
#   --search "query"   filter the workspace before downloading

# Safe preview (what the test:dry npm script runs):
node suno-cli.js download --dry-run --limit 5
```

Files land in `./downloads/` (or `SUNO_DOWNLOADS_DIR`), named
`<track-title>-<clip-id>.wav`, with numeric suffixes on collision.

## Tests

```bash
npm test               # Jest unit/integration suite (mock Playwright page)
```

---

## Rules for agents

- The live integration is **download only**. Verify any change still satisfies
  `node suno-cli.js download --format wav --resume`.
- No hardcoded secrets, no mock data in anything that ships. Use `.env.local`.
- Do not extend the orphaned create/remix/extend/cover/server/api surfaces —
  they are being retired. Prefer migrating download to
  `Suno/automation/suno_wav_api.py` over patching browser automation here.
- See `/Users/isaiahdupree/Documents/Software/MUSIC-STACK.md` for how this repo
  fits the Suno Music Factory and the SEOdocumentary video pipeline.
