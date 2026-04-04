/**
 * Verify no secrets or sensitive data leak into tracked files.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

function getTrackedFiles() {
  const gitignore = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf-8');
  const ignored = gitignore.split('\n').map(l => l.trim()).filter(Boolean);

  // Recursively get all non-ignored files
  const files = [];
  function walk(dir, rel = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      if (ignored.some(p => {
        const pattern = p.replace(/\/$/, '');
        return relPath === pattern || relPath.startsWith(pattern + '/') ||
               entry.name === pattern || entry.name.match(new RegExp('^' + pattern.replace('*', '.*') + '$'));
      })) continue;

      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relPath);
      } else {
        files.push({ abs: path.join(dir, entry.name), rel: relPath });
      }
    }
  }
  walk(PROJECT_ROOT);
  return files;
}

describe('no secrets in tracked files', () => {
  const files = getTrackedFiles();
  const SECRET_PATTERNS = [
    /(?:api[_-]?key|apikey)\s*[:=]\s*["'][a-zA-Z0-9]{16,}/i,
    /(?:secret|token|password)\s*[:=]\s*["'][a-zA-Z0-9]{8,}/i,
    /(?:bearer|authorization)\s*[:=]\s*["'][a-zA-Z0-9]{16,}/i,
    /ghp_[a-zA-Z0-9]{30,}/,        // GitHub personal token
    /gho_[a-zA-Z0-9]{30,}/,        // GitHub OAuth token
    /sk-[a-zA-Z0-9]{30,}/,         // OpenAI-style key
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
    /(?:aws_access_key_id|aws_secret_access_key)\s*=\s*\S+/i,
  ];

  test('gitignore excludes browser-data', () => {
    const gitignore = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('browser-data/');
  });

  test('gitignore excludes downloads', () => {
    const gitignore = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('downloads/');
  });

  test('gitignore excludes node_modules', () => {
    const gitignore = fs.readFileSync(path.join(PROJECT_ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules/');
  });

  test('no .env files tracked', () => {
    const envFiles = files.filter(f => f.rel.includes('.env'));
    expect(envFiles).toHaveLength(0);
  });

  test.each(files.filter(f => f.rel.endsWith('.js') || f.rel.endsWith('.json')))
    ('no secrets in $rel', ({ abs }) => {
      const content = fs.readFileSync(abs, 'utf-8');
      for (const pattern of SECRET_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    });

  test('browser-data directory is not tracked', () => {
    const tracked = files.map(f => f.rel);
    const browserData = tracked.filter(f => f.startsWith('browser-data'));
    expect(browserData).toHaveLength(0);
  });
});
