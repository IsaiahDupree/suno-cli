/**
 * CLI tests — verify help output and JSON configs.
 */
const { execSync } = require('child_process');
const path = require('path');

const CLI = path.join(__dirname, '..', 'suno-cli.js');

function runCLI(args = '') {
  try {
    return execSync(`node "${CLI}" ${args}`, {
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
  } catch (err) {
    // execSync throws on non-zero exit, but stdout is still captured
    return (err.stdout || '') + (err.stderr || '');
  }
}

describe('CLI help output', () => {
  test('shows help with no args', () => {
    const output = runCLI();
    expect(output).toContain('Suno CLI');
    expect(output).toContain('create');
    expect(output).toContain('download');
    expect(output).toContain('remix');
    expect(output).toContain('extend');
    expect(output).toContain('cover');
  });

  test('shows help with --help flag', () => {
    const output = runCLI('--help');
    expect(output).toContain('Suno CLI');
  });

  test('shows help with help command', () => {
    const output = runCLI('help');
    expect(output).toContain('Suno CLI');
  });

  test('help includes all option descriptions', () => {
    const output = runCLI();
    expect(output).toContain('--prompt');
    expect(output).toContain('--lyrics');
    expect(output).toContain('--style');
    expect(output).toContain('--title');
    expect(output).toContain('--voice');
    expect(output).toContain('--model');
    expect(output).toContain('--instrumental');
    expect(output).toContain('--clip-id');
    expect(output).toContain('--config');
    expect(output).toContain('--format');
    expect(output).toContain('--resume');
    expect(output).toContain('--json');
  });
});

describe('JSON config files', () => {
  test('example create config is valid JSON with expected fields', () => {
    const config = require('../examples/create-song.json');
    expect(config.lyrics).toBeDefined();
    expect(typeof config.lyrics).toBe('string');
    expect(config.style).toBeDefined();
    expect(config.title).toBe('Midnight Runners');
    expect(config.format).toBe('wav');
    expect(typeof config.instrumental).toBe('boolean');
  });

  test('example remix config is valid JSON with expected fields', () => {
    const config = require('../examples/remix-track.json');
    expect(config.clipId).toBeDefined();
    expect(config.style).toBeDefined();
    expect(config.lyrics).toBeDefined();
  });

  test('create config has all supported fields', () => {
    const config = require('../examples/create-song.json');
    const expectedKeys = ['prompt', 'lyrics', 'style', 'title', 'instrumental', 'model', 'voice', 'autoDownload', 'format'];
    for (const key of expectedKeys) {
      expect(config).toHaveProperty(key);
    }
  });
});
