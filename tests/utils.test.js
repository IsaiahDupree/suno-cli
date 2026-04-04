const path = require('path');
const fs = require('fs');
const os = require('os');

const { uniquePath, parseArgs, sanitizeFilename, DOWNLOAD_DIR } = require('../lib/utils');

describe('parseArgs', () => {
  test('parses command from argv', () => {
    const { command } = parseArgs(['node', 'suno-cli.js', 'create']);
    expect(command).toBe('create');
  });

  test('returns null command when only flags', () => {
    const { command } = parseArgs(['node', 'suno-cli.js', '--help']);
    expect(command).toBeNull();
  });

  test('getFlag returns true for present flags', () => {
    const { getFlag } = parseArgs(['node', 'suno-cli.js', 'download', '--resume', '--dry-run']);
    expect(getFlag('--resume')).toBe(true);
    expect(getFlag('--dry-run')).toBe(true);
    expect(getFlag('--mp3')).toBe(false);
  });

  test('getArg returns value after flag', () => {
    const { getArg } = parseArgs(['node', 'suno-cli.js', 'download', '--format', 'mp3', '--limit', '10']);
    expect(getArg('--format')).toBe('mp3');
    expect(getArg('--limit')).toBe('10');
    expect(getArg('--missing')).toBeNull();
  });

  test('getArgMulti collects multi-word values', () => {
    const { getArgMulti } = parseArgs(['node', 'suno-cli.js', 'create', '--style', 'indie', 'pop', 'synth', '--title', 'My Song']);
    expect(getArgMulti('--style')).toBe('indie pop synth');
    expect(getArgMulti('--title')).toBe('My Song');
  });

  test('getArgMulti stops at next flag', () => {
    const { getArgMulti } = parseArgs(['node', 'suno-cli.js', 'create', '--lyrics', 'hello world', '--style', 'pop']);
    expect(getArgMulti('--lyrics')).toBe('hello world');
    expect(getArgMulti('--style')).toBe('pop');
  });

  test('getArgMulti returns null for missing flag', () => {
    const { getArgMulti } = parseArgs(['node', 'suno-cli.js', 'create']);
    expect(getArgMulti('--lyrics')).toBeNull();
  });

  test('all commands parse correctly', () => {
    for (const cmd of ['create', 'download', 'list', 'remix', 'extend', 'cover']) {
      const { command } = parseArgs(['node', 'suno-cli.js', cmd]);
      expect(command).toBe(cmd);
    }
  });
});

describe('sanitizeFilename', () => {
  test('removes invalid chars', () => {
    expect(sanitizeFilename('my:song<1>.wav')).toBe('my_song_1_.wav');
  });

  test('truncates long names', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBe(200);
  });

  test('passes through clean names', () => {
    expect(sanitizeFilename('cool-track (remix).wav')).toBe('cool-track (remix).wav');
  });
});

describe('uniquePath', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suno-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns original path when file does not exist', () => {
    const result = uniquePath(tmpDir, 'song.wav');
    expect(result).toBe(path.join(tmpDir, 'song.wav'));
  });

  test('appends (1) when file exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'song.wav'), '');
    const result = uniquePath(tmpDir, 'song.wav');
    expect(result).toBe(path.join(tmpDir, 'song (1).wav'));
  });

  test('increments counter for multiple collisions', () => {
    fs.writeFileSync(path.join(tmpDir, 'song.wav'), '');
    fs.writeFileSync(path.join(tmpDir, 'song (1).wav'), '');
    fs.writeFileSync(path.join(tmpDir, 'song (2).wav'), '');
    const result = uniquePath(tmpDir, 'song.wav');
    expect(result).toBe(path.join(tmpDir, 'song (3).wav'));
  });
});

describe('DOWNLOAD_DIR', () => {
  test('points to downloads folder', () => {
    expect(DOWNLOAD_DIR).toMatch(/downloads$/);
  });
});
