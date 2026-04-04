const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'downloads');

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

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const rest = command ? args.slice(1) : args;

  function getFlag(name) {
    return rest.includes(name);
  }

  function getArg(name) {
    const idx = rest.indexOf(name);
    if (idx === -1) return null;
    return rest[idx + 1] || null;
  }

  function getArgMulti(name) {
    // Collect all values after --name until next flag
    const idx = rest.indexOf(name);
    if (idx === -1) return null;
    const values = [];
    for (let i = idx + 1; i < rest.length && !rest[i].startsWith('--'); i++) {
      values.push(rest[i]);
    }
    return values.length ? values.join(' ') : null;
  }

  return { command, getFlag, getArg, getArgMulti, raw: rest };
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 200);
}

module.exports = { DOWNLOAD_DIR, uniquePath, parseArgs, sanitizeFilename };
