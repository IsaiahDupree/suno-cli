const fs = require('fs');
const path = require('path');
const {
  verifyFileSignature,
  verifySizeRange,
  verifyAudioFile,
  verifyOrRepair,
  MIN_FILE_SIZE,
  MAX_FILE_SIZE,
} = require('../lib/verifier');

const TEST_DIR = path.join(__dirname, 'tmp');

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.readdirSync(TEST_DIR).forEach(f => fs.unlinkSync(path.join(TEST_DIR, f)));
    fs.rmdirSync(TEST_DIR);
  }
});

describe('verifyFileSignature', () => {
  test('detects valid WAV files', () => {
    const wavPath = path.join(TEST_DIR, 'test.wav');
    // Create fake WAV with proper RIFF header
    const buffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
    fs.writeFileSync(wavPath, buffer);

    expect(verifyFileSignature(wavPath, 'wav')).toBe(true);
    expect(verifyFileSignature(wavPath, 'mp3')).toBe(false);
  });

  test('detects valid MP3 files with frame sync', () => {
    const mp3Path = path.join(TEST_DIR, 'test.mp3');
    // MP3 with frame sync header
    const buffer = Buffer.from([0xff, 0xfb, 0x00, 0x00]);
    fs.writeFileSync(mp3Path, buffer);

    expect(verifyFileSignature(mp3Path, 'mp3')).toBe(true);
    expect(verifyFileSignature(mp3Path, 'wav')).toBe(false);
  });

  test('detects valid MP3 files with ID3 tag', () => {
    const mp3Path = path.join(TEST_DIR, 'test-id3.mp3');
    // MP3 with ID3 tag
    const buffer = Buffer.from([0x49, 0x44, 0x33, 0x00]);
    fs.writeFileSync(mp3Path, buffer);

    expect(verifyFileSignature(mp3Path, 'mp3')).toBe(true);
  });

  test('returns false for non-existent files', () => {
    expect(verifyFileSignature('/nonexistent/file.wav', 'wav')).toBe(false);
  });

  test('returns false for invalid format', () => {
    const invalidPath = path.join(TEST_DIR, 'invalid.wav');
    fs.writeFileSync(invalidPath, Buffer.from([0x00, 0x00, 0x00, 0x00]));

    expect(verifyFileSignature(invalidPath, 'wav')).toBe(false);
  });
});

describe('verifySizeRange', () => {
  test('passes files within acceptable range', () => {
    const filePath = path.join(TEST_DIR, 'valid-size.wav');
    const size = 500 * 1024; // 500 KB
    fs.writeFileSync(filePath, Buffer.alloc(size));

    const result = verifySizeRange(filePath);
    expect(result.valid).toBe(true);
    expect(parseFloat(result.sizeMB)).toBeCloseTo(0.49, 1);
  });

  test('rejects files that are too small', () => {
    const filePath = path.join(TEST_DIR, 'too-small.wav');
    const size = 50 * 1024; // 50 KB
    fs.writeFileSync(filePath, Buffer.alloc(size));

    const result = verifySizeRange(filePath);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('File too small');
  });

  test('rejects non-existent files', () => {
    const result = verifySizeRange('/nonexistent/file.wav');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not exist');
  });

  test('correctly calculates file size in MB', () => {
    const filePath = path.join(TEST_DIR, 'size-check.wav');
    const size = 2 * 1024 * 1024; // 2 MB
    fs.writeFileSync(filePath, Buffer.alloc(size));

    const result = verifySizeRange(filePath);
    expect(parseFloat(result.sizeMB)).toBeCloseTo(2.0, 1);
  });
});

describe('verifyAudioFile', () => {
  test('validates correct WAV files', () => {
    const wavPath = path.join(TEST_DIR, 'valid.wav');
    // Create WAV with RIFF header + decent size
    const header = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const padding = Buffer.alloc(500 * 1024 - header.length);
    const file = Buffer.concat([header, padding]);
    fs.writeFileSync(wavPath, file);

    const result = verifyAudioFile(wavPath, 'wav');
    expect(result.valid).toBe(true);
    expect(result.format).toBe('wav');
  });

  test('validates correct MP3 files', () => {
    const mp3Path = path.join(TEST_DIR, 'valid.mp3');
    const header = Buffer.from([0xff, 0xfb]);
    const padding = Buffer.alloc(500 * 1024 - header.length);
    const file = Buffer.concat([header, padding]);
    fs.writeFileSync(mp3Path, file);

    const result = verifyAudioFile(mp3Path, 'mp3');
    expect(result.valid).toBe(true);
    expect(result.format).toBe('mp3');
  });

  test('reports errors for corrupted files', () => {
    const corruptPath = path.join(TEST_DIR, 'corrupt.wav');
    fs.writeFileSync(corruptPath, Buffer.alloc(50 * 1024)); // Too small, wrong format

    const result = verifyAudioFile(corruptPath, 'wav');
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('includes sizeMB in result', () => {
    const wavPath = path.join(TEST_DIR, 'sized.wav');
    const header = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const size = 2 * 1024 * 1024;
    const padding = Buffer.alloc(size - header.length);
    fs.writeFileSync(wavPath, Buffer.concat([header, padding]));

    const result = verifyAudioFile(wavPath, 'wav');
    expect(result.sizeMB).toBeDefined();
    expect(parseFloat(result.sizeMB)).toBeCloseTo(2.0, 1);
  });
});

describe('verifyOrRepair', () => {
  test('returns valid status for good files', () => {
    const wavPath = path.join(TEST_DIR, 'good.wav');
    const header = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    const padding = Buffer.alloc(500 * 1024 - header.length);
    fs.writeFileSync(wavPath, Buffer.concat([header, padding]));

    const result = verifyOrRepair(wavPath, 'wav', { logOutput: false });
    expect(result.valid).toBe(true);
  });

  test('logs errors when logOutput is true', () => {
    const badPath = path.join(TEST_DIR, 'bad.wav');
    fs.writeFileSync(badPath, Buffer.alloc(50 * 1024));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    verifyOrRepair(badPath, 'wav', { logOutput: true });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('does not log errors when logOutput is false', () => {
    const badPath = path.join(TEST_DIR, 'bad.wav');
    fs.writeFileSync(badPath, Buffer.alloc(50 * 1024));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    verifyOrRepair(badPath, 'wav', { logOutput: false });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
