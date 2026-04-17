# Suno CLI — Full-Featured Browser Automation for suno.com

A complete command-line interface for Suno.com AI music generation. Create, download, remix, extend, and cover music tracks with full browser automation using Playwright.

## Features

- ✨ **Create music** from text prompts with custom parameters
- 🎵 **Generate multiple formats** (WAV/MP3) with parallel downloads
- 📝 **Advanced generation options** including lyrics, style, voice, and model version selection
- 🔄 **Remix, extend, and cover** existing tracks
- 📋 **List and search** tracks in your workspace
- 🗑️ **Delete tracks** with confirmation
- ⚙️ **Configuration management** for default settings
- 🔐 **Persistent browser session** maintains login state between commands
- 🧪 **Comprehensive test suite** with 92+ passing tests

## Installation

```bash
# Clone and install
git clone <repo-url> suno-cli
cd suno-cli
npm install

# Make it globally available (optional)
npm link
```

## Quick Start

```bash
# Show help
node suno-cli.js help

# Create a track with a simple prompt
node suno-cli.js create --prompt "a chill lofi beat about rainy days"

# Create with custom lyrics and style
node suno-cli.js create \
  --lyrics "Verse 1 lyrics here" \
  --style "jazz fusion" \
  --title "My Jazz Track" \
  --voice "My Voice 1"

# Download all tracks as WAV
node suno-cli.js download --format wav

# List all tracks as JSON
node suno-cli.js list --json

# Remix an existing track
node suno-cli.js remix --clip-id abc123 --style "pop" --title "Remixed Version"

# Delete a track
node suno-cli.js delete --clip-id abc123
node suno-cli.js delete --clip-id abc123 --confirm  # Skip confirmation
```

## Commands

### `create` — Generate new music

Create a new track from scratch with various options:

```bash
node suno-cli.js create [options]
```

**Options:**
- `--prompt "description"` — Simple prompt (mutually exclusive with lyrics)
- `--lyrics "text"` — Custom lyrics (switches to Advanced mode)
- `--style "genre"` — Style/genre tags (e.g., "pop", "jazz fusion", "ambient")
- `--title "name"` — Track title
- `--instrumental` — Create instrumental (no vocals)
- `--model "version"` — Model version (v3.5, v4, v5, v5.5) — default: v5
- `--voice "name"` — Voice selection (e.g., "My Voice 1")
- `--auto-download` — Download immediately after creation
- `--config file.json` — Load parameters from JSON file

**Examples:**
```bash
# Simple prompt
node suno-cli.js create --prompt "upbeat dance track with electronic drums"

# Advanced with lyrics
node suno-cli.js create \
  --lyrics "Verse 1: Hello world, are you out there?" \
  --style "indie pop" \
  --title "Hello World" \
  --voice "My Voice 1"

# Load from config file
node suno-cli.js create --config song.json
```

### `download` — Download generated tracks

Download tracks as WAV or MP3 files with resume and filtering:

```bash
node suno-cli.js download [options]
```

**Options:**
- `--format wav|mp3` — Audio format (default: wav)
- `--limit N` — Max tracks to download (default: all)
- `--search "query"` — Search before downloading
- `--filter "name"` — Apply filter (future feature)
- `--resume` — Skip already downloaded tracks
- `--dry-run` — List tracks without downloading

**Examples:**
```bash
# Download all as WAV
node suno-cli.js download --format wav

# Download 10 as MP3, skip existing
node suno-cli.js download --format mp3 --limit 10 --resume

# Preview what will download
node suno-cli.js download --dry-run --limit 5
```

### `list` — Show tracks in workspace

List tracks with metadata and optional JSON output:

```bash
node suno-cli.js list [options]
```

**Options:**
- `--search "query"` — Search for tracks matching query
- `--limit N` — Max tracks to list
- `--json` — Output as JSON (useful for scripts)

**Examples:**
```bash
# Show all tracks
node suno-cli.js list

# Search for tracks
node suno-cli.js list --search "jazz" --limit 20

# Get JSON output
node suno-cli.js list --json > tracks.json
```

### `remix` — Remix a track

Create a remix of an existing track with modified parameters:

```bash
node suno-cli.js remix --clip-id ID [options]
```

**Options:**
- `--clip-id ID` — Track ID to remix (required)
- `--lyrics "text"` — New/modified lyrics
- `--style "genre"` — New style
- `--title "name"` — New title
- `--voice "name"` — Voice selection

**Examples:**
```bash
# Simple remix with new style
node suno-cli.js remix --clip-id abc123 --style "jazz fusion"

# Full remix
node suno-cli.js remix \
  --clip-id abc123 \
  --lyrics "New verse here" \
  --style "lo-fi" \
  --title "Remixed Version"
```

### `extend` — Extend a track

Extend an existing track with additional sections:

```bash
node suno-cli.js extend --clip-id ID [options]
```

**Options:**
- `--clip-id ID` — Track ID to extend (required)
- `--lyrics "text"` — Additional lyrics
- `--style "genre"` — Style for extension

**Examples:**
```bash
node suno-cli.js extend --clip-id abc123 --lyrics "Bridge section with new lyrics"
```

### `cover` — Create a cover

Create a cover version of a track in a different voice/style:

```bash
node suno-cli.js cover --clip-id ID [options]
```

**Options:**
- `--clip-id ID` — Track ID to cover (required)
- `--voice "name"` — Voice for cover
- `--style "genre"` — Style for cover

**Examples:**
```bash
node suno-cli.js cover --clip-id abc123 --voice "My Voice 2" --style "acoustic"
```

### `delete` — Delete a track

Delete a track from your workspace:

```bash
node suno-cli.js delete --clip-id ID [--confirm]
```

**Options:**
- `--clip-id ID` — Track ID to delete (required)
- `--confirm` — Skip confirmation prompt

**Examples:**
```bash
# Delete with confirmation prompt
node suno-cli.js delete --clip-id abc123

# Delete without confirmation
node suno-cli.js delete --clip-id abc123 --confirm
```

### `config` — Manage configuration

View and manage persistent configuration settings:

```bash
node suno-cli.js config [options]
```

**Options:**
- (no args) — Show all settings
- `--get key` — Get a single value
- `--set key value` — Set a value
- `--reset` — Reset to defaults

**Configurable settings:**
- `model` — Default model version (v3.5, v4, v5, v5.5)
- `format` — Default download format (wav, mp3)
- `voice` — Default voice selection
- `style` — Default style

**Examples:**
```bash
# View current config
node suno-cli.js config

# Set default model
node suno-cli.js config --set model v5.5

# Get a single value
node suno-cli.js config --get format

# Reset to defaults
node suno-cli.js config --reset
```

## Configuration

Configuration can come from three sources (in priority order):

### 1. Command-line arguments (highest priority)
```bash
node suno-cli.js create --model v5 --style "pop"
```

### 2. JSON config file
```bash
node suno-cli.js create --config my-song.json
```

Example `my-song.json`:
```json
{
  "prompt": "a chill lofi beat",
  "style": "lofi hip-hop",
  "title": "Rainy Day",
  "model": "v5"
}
```

### 3. Persistent settings (stored in `~/.suno/config.json`)
```bash
node suno-cli.js config --set model v5.5
node suno-cli.js config --set format mp3
```

### 4. Environment variables (lowest priority)
```bash
export SUNO_MODEL=v5.5
export SUNO_FORMAT=mp3
export SUNO_VOICE="My Voice 1"
export SUNO_STYLE="jazz"

node suno-cli.js create --prompt "test"
```

## File Structure

```
suno-cli/
├── suno-cli.js              # Main CLI entry point
├── lib/
│   ├── browser.js           # Browser automation & session management
│   ├── create.js            # Create command implementation
│   ├── download.js          # Download command implementation
│   ├── list.js              # List command implementation
│   ├── remix.js             # Remix/extend/cover implementation
│   ├── delete.js            # Delete command implementation
│   ├── config.js            # Configuration command
│   ├── config-store.js      # Persistent config storage
│   └── utils.js             # Utilities (parsing, file handling)
├── tests/
│   ├── *.test.js            # Test suites (92+ tests)
│   └── mock-page.js         # Mock Playwright page for testing
├── browser-data/            # Persistent browser session data
├── downloads/               # Downloaded audio files
├── examples/                # Example config files
└── package.json             # Dependencies

```

## Browser Data

The CLI uses a persistent Chromium context stored in `./browser-data/` to maintain your login session across commands. This means:

- You only need to log in once
- Your session persists between runs
- All browser state (cookies, localStorage) is preserved

**To reset your session:**
```bash
rm -rf browser-data/
# Next command will require you to log in again
```

## Downloading Tracks

Downloaded files are saved to `./downloads/` with the following structure:

```
downloads/
├── track-title-abc123.wav
├── track-title-abc123 (1).wav   # If filename already exists
└── ...
```

Duplicate filenames are handled automatically with numeric suffixes.

## Testing

The project includes a comprehensive test suite:

```bash
# Run all tests
npm test

# Run with verbose output
npm test -- --verbose

# Run specific test file
npm test tests/create.test.js

# Run tests with coverage
npm test -- --coverage
```

**Current test coverage:**
- 92+ unit and integration tests
- Mock browser automation
- CLI argument parsing
- Config management
- Error handling scenarios
- Secrets scanning

## Troubleshooting

### "Please log in to Suno in the browser window"
The browser window will open automatically. Log in to Suno.com using the browser UI. The CLI will continue once login is detected.

### Downloads failing with "Download option not found"
- Check that you're logged in
- Verify the tracks are fully generated (not in progress)
- Try again — sometimes the UI takes time to render

### Config not being applied
Configuration priority (highest to lowest):
1. Command-line flags (e.g., `--model v5`)
2. JSON config file (e.g., `--config file.json`)
3. Persistent settings (e.g., `~/.suno/config.json`)
4. Environment variables (e.g., `SUNO_MODEL=v5`)

Use `config --get key` to check what's currently set.

### "Cannot find module" errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## Performance Tips

- **Use `--limit` with download** to avoid downloading unnecessary tracks
- **Use `--resume` flag** to skip already-downloaded tracks
- **Batch operations** with multiple generation requests
- **Check current config** with `config` command before bulk operations

## Environment Variables

```bash
SUNO_MODEL="v5"              # Default model version
SUNO_FORMAT="wav"            # Default download format
SUNO_VOICE="My Voice 1"      # Default voice selection
SUNO_STYLE="pop"             # Default style
```

## Development

### Project Structure
- **lib/**: Core functionality modules
- **tests/**: Comprehensive test suite using Jest
- **examples/**: Example configuration files
- **browser-data/**: Persistent browser session

### Adding New Features
1. Create implementation file in `lib/`
2. Add CLI handler in `suno-cli.js`
3. Add tests in `tests/`
4. Update this README

### Running Tests
```bash
npm test                    # All tests
npm test -- --watch       # Watch mode
```

## Known Limitations

- Requires browser window (no headless mode yet)
- Suno web UI changes may require selector updates
- Rate limiting depends on Suno.com API availability
- Generation time varies (typically 1-2 minutes per track)

## Contributing

Contributions are welcome! Please:
1. Add tests for new features
2. Ensure all tests pass: `npm test`
3. Update README with usage examples
4. Follow existing code style

## License

ISC

## Support

For issues:
1. Check the troubleshooting section above
2. Review your configuration: `node suno-cli.js config`
3. Check browser data: `ls -la browser-data/`
4. Review test output: `npm test -- --verbose`

## Changelog

### v1.0.0 (Current)
- Full create/download/list/remix/extend/cover support
- Delete and config commands
- Persistent browser session
- Comprehensive test suite (92+ tests)
- Environment variable and config file support
- Resume and dry-run modes for downloads
