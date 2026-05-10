# suno-cli

Full-featured Suno browser automation — create, download, remix, extend, and cover tracks via Playwright.

## Requirements

- Node.js 18+
- Playwright (installed via `npm install`; will auto-fetch a browser on first run if needed)
- A logged-in Suno account (the CLI persists session state under `browser-data/`)

## Install

```bash
npm install
```

This installs the `playwright` dependency. The first run will use the bundled Chromium (run `npx playwright install chromium` if it is missing).

## Run

The primary entry point is `suno-cli.js`. Print the command list:

```bash
node suno-cli.js
# or
node suno-cli.js --help
```

### Commands

| Command   | npm script         | Purpose                          |
|-----------|--------------------|----------------------------------|
| `create`  | `npm run create`   | Create a new track               |
| `download`| `npm run download` | Download tracks (WAV/MP3)        |
| `list`    | `npm run list`     | List tracks in the workspace     |
| `remix`   | `npm run remix`    | Remix an existing track          |
| `extend`  | `npm run extend`   | Extend an existing track         |
| `cover`   | `npm run cover`    | Cover an existing track          |

### Examples

```bash
# Create from a prompt
node suno-cli.js create --prompt "lofi hip-hop, rainy night" --title "rain"

# Dry-run a download (no files written)
npm run test:dry

# Download the latest 10 tracks as WAV
node suno-cli.js download --format wav --limit 10 --resume

# List tracks as JSON
node suno-cli.js list --json --limit 20
```

See `node suno-cli.js --help` for the full flag reference.

## Tests

```bash
npm test
```

Runs the Jest suite under `tests/`.

## Project layout

- `suno-cli.js` — CLI entry (also exposed as the `suno` bin)
- `lib/` — automation primitives
- `examples/` — sample configs / prompts
- `tests/` — Jest tests
- `browser-data/` — persistent Playwright user-data dir (do not commit)
- `downloads/` — default output directory for `download`
