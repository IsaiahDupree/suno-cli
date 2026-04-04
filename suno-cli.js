#!/usr/bin/env node
/**
 * Suno CLI — Full browser automation for suno.com
 *
 * Commands:
 *   create     Create a new track (prompt, lyrics, style, title, voice, model)
 *   download   Download tracks as WAV/MP3
 *   list       List tracks in your workspace
 *   remix      Remix an existing track
 *   extend     Extend an existing track
 *   cover      Create a cover of a track
 *
 * Examples:
 *   node suno-cli.js create --lyrics "Hello world..." --style "pop rock" --title "My Song"
 *   node suno-cli.js create --prompt "a chill lofi beat about rainy days"
 *   node suno-cli.js create --config song.json
 *   node suno-cli.js download --format wav --limit 10
 *   node suno-cli.js download --resume
 *   node suno-cli.js list --json
 *   node suno-cli.js remix --clip-id abc123 --style "jazz fusion"
 *   node suno-cli.js extend --clip-id abc123 --lyrics "next verse..."
 *   node suno-cli.js cover --clip-id abc123 --voice "My Voice 1"
 */
const fs = require('fs');
const { launchBrowser } = require('./lib/browser');
const { parseArgs } = require('./lib/utils');

const HELP = `
╔══════════════════════════════════════════════════╗
║              Suno CLI                            ║
╠══════════════════════════════════════════════════╣
║  Commands:                                       ║
║    create    Create new music                    ║
║    download  Download tracks (WAV/MP3)           ║
║    list      List tracks in workspace            ║
║    remix     Remix an existing track             ║
║    extend    Extend an existing track            ║
║    cover     Cover an existing track             ║
║                                                  ║
║  Create options:                                 ║
║    --prompt "desc"     Simple mode description   ║
║    --lyrics "text"     Custom lyrics             ║
║    --style "genre"     Style/genre tags          ║
║    --title "name"      Track title               ║
║    --instrumental      Instrumental (no vocals)  ║
║    --model "v4"        Model version             ║
║    --voice "name"      Voice selection           ║
║    --auto-download     Download after creation   ║
║    --config file.json  Load params from JSON     ║
║                                                  ║
║  Download options:                               ║
║    --format wav|mp3    Audio format (default wav) ║
║    --search "query"    Search before downloading ║
║    --filter "name"     Apply filter              ║
║    --limit N           Max tracks to download    ║
║    --resume            Skip already downloaded   ║
║    --dry-run           List without downloading  ║
║                                                  ║
║  Remix/Extend/Cover options:                     ║
║    --clip-id "id"      Track ID (required)       ║
║    --lyrics "text"     New/modified lyrics       ║
║    --style "genre"     New style                 ║
║    --title "name"      New title                 ║
║    --voice "name"      Voice selection           ║
║                                                  ║
║  List options:                                   ║
║    --search "query"    Search tracks             ║
║    --limit N           Max tracks to list        ║
║    --json              Output as JSON            ║
╚══════════════════════════════════════════════════╝
`;

(async () => {
  const { command, getFlag, getArg, getArgMulti } = parseArgs(process.argv);

  if (!command || command === 'help' || getFlag('--help') || getFlag('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  // Load config from JSON file if provided
  let config = {};
  const configFile = getArg('--config');
  if (configFile) {
    if (!fs.existsSync(configFile)) {
      console.error(`Config file not found: ${configFile}`);
      process.exit(1);
    }
    config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    console.log(`Loaded config from ${configFile}`);
  }

  const { context, page } = await launchBrowser();

  try {
    switch (command) {
      case 'create': {
        const { runCreate } = require('./lib/create');
        await runCreate(page, {
          prompt: getArgMulti('--prompt') || config.prompt,
          lyrics: getArgMulti('--lyrics') || config.lyrics,
          style: getArgMulti('--style') || config.style,
          title: getArgMulti('--title') || config.title,
          instrumental: getFlag('--instrumental') || config.instrumental || false,
          model: getArg('--model') || config.model,
          voice: getArgMulti('--voice') || config.voice,
          autoDownload: getFlag('--auto-download') || config.autoDownload || false,
          format: getArg('--format') || config.format || 'wav',
        });
        break;
      }

      case 'download': {
        const { runDownload } = require('./lib/download');
        await runDownload(page, {
          format: getArg('--format') || 'wav',
          search: getArgMulti('--search'),
          filter: getArgMulti('--filter'),
          limit: getArg('--limit') ? parseInt(getArg('--limit')) : Infinity,
          dryRun: getFlag('--dry-run'),
          resume: getFlag('--resume'),
        });
        break;
      }

      case 'list': {
        const { runList } = require('./lib/list');
        await runList(page, {
          search: getArgMulti('--search'),
          limit: getArg('--limit') ? parseInt(getArg('--limit')) : Infinity,
          json: getFlag('--json'),
        });
        break;
      }

      case 'remix': {
        const { runRemix } = require('./lib/remix');
        await runRemix(page, {
          clipId: getArg('--clip-id') || config.clipId,
          lyrics: getArgMulti('--lyrics') || config.lyrics,
          style: getArgMulti('--style') || config.style,
          title: getArgMulti('--title') || config.title,
          voice: getArgMulti('--voice') || config.voice,
        });
        break;
      }

      case 'extend': {
        const { runExtend } = require('./lib/remix');
        await runExtend(page, {
          clipId: getArg('--clip-id') || config.clipId,
          lyrics: getArgMulti('--lyrics') || config.lyrics,
          style: getArgMulti('--style') || config.style,
        });
        break;
      }

      case 'cover': {
        const { runCover } = require('./lib/remix');
        await runCover(page, {
          clipId: getArg('--clip-id') || config.clipId,
          style: getArgMulti('--style') || config.style,
          voice: getArgMulti('--voice') || config.voice,
        });
        break;
      }

      default:
        console.log(`Unknown command: "${command}"\n`);
        console.log(HELP);
        break;
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    console.error(err.stack);
  } finally {
    await context.close();
    process.exit(0);
  }
})();
