const fs = require('fs');
const path = require('path');
const {
  extractDate,
  extractGenre,
  getOrganizedPath,
  loadMetadata,
  organizeFile,
  organizeDirectory,
  getOrganizationStats,
} = require('../lib/organizer');

const TEST_DIR = path.join(__dirname, 'tmp-org');

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    const files = fs.readdirSync(TEST_DIR);
    // Recursively delete all files and directories
    function deleteRecursive(dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
          deleteRecursive(fullPath);
        } else {
          fs.unlinkSync(fullPath);
        }
      }
      fs.rmdirSync(dir);
    }
    deleteRecursive(TEST_DIR);
  }
});

describe('extractDate', () => {
  test('extracts date from metadata', () => {
    const filePath = '/path/to/song.wav';
    const metadata = { downloadedAt: '2026-04-15T10:30:00Z' };
    expect(extractDate(filePath, metadata)).toBe('2026-04-15');
  });

  test('extracts date from filename pattern', () => {
    const filePath = '/downloads/2026-03-20_song.wav';
    expect(extractDate(filePath, {})).toBe('2026-03-20');
  });

  test('returns today\'s date as fallback', () => {
    const filePath = '/path/to/song.wav';
    const today = new Date().toISOString().split('T')[0];
    const result = extractDate(filePath, {});
    expect(result).toBe(today);
  });
});

describe('extractGenre', () => {
  test('extracts genre from metadata.style', () => {
    const metadata = { style: 'Lo-Fi Hip Hop' };
    expect(extractGenre('/path/song.wav', metadata)).toBe('lo-fi-hip-hop');
  });

  test('extracts genre from metadata.genre', () => {
    const metadata = { genre: 'Electronic' };
    expect(extractGenre('/path/song.wav', metadata)).toBe('electronic');
  });

  test('extracts genre from metadata.category', () => {
    const metadata = { category: 'Pop Rock' };
    expect(extractGenre('/path/song.wav', metadata)).toBe('pop-rock');
  });

  test('returns uncategorized when no genre data', () => {
    expect(extractGenre('/path/song.wav', {})).toBe('uncategorized');
  });

  test('truncates long genre names', () => {
    const metadata = { style: 'A'.repeat(50) };
    const result = extractGenre('/path/song.wav', metadata);
    expect(result.length).toBeLessThanOrEqual(30);
  });
});

describe('getOrganizedPath', () => {
  test('organizes by date', () => {
    const filePath = '/downloads/song.wav';
    const metadata = { downloadedAt: '2026-04-15T10:30:00Z' };
    const result = getOrganizedPath(filePath, '/music', 'date', { metadata });
    expect(result).toBe(path.join('/music', '2026-04-15', 'song.wav'));
  });

  test('organizes by genre', () => {
    const filePath = '/downloads/song.wav';
    const metadata = { style: 'Jazz' };
    const result = getOrganizedPath(filePath, '/music', 'genre', { metadata });
    expect(result).toBe(path.join('/music', 'jazz', 'song.wav'));
  });

  test('organizes by date-genre', () => {
    const filePath = '/downloads/song.wav';
    const metadata = { downloadedAt: '2026-04-15T10:30:00Z', style: 'Jazz' };
    const result = getOrganizedPath(filePath, '/music', 'date-genre', { metadata });
    expect(result).toBe(path.join('/music', '2026-04-15', 'jazz', 'song.wav'));
  });

  test('organizes by year-month', () => {
    const filePath = '/downloads/song.wav';
    const metadata = { downloadedAt: '2026-04-15T10:30:00Z' };
    const result = getOrganizedPath(filePath, '/music', 'year-month', { metadata });
    expect(result).toBe(path.join('/music', '2026', '04', 'song.wav'));
  });

  test('respects custom path', () => {
    const filePath = '/downloads/song.wav';
    const result = getOrganizedPath(filePath, '/music', 'date', { customPath: 'favorites' });
    expect(result).toBe(path.join('/music', 'favorites', 'song.wav'));
  });
});

describe('loadMetadata', () => {
  test('loads metadata JSON file', () => {
    const audioPath = path.join(TEST_DIR, 'song.wav');
    const metaPath = path.join(TEST_DIR, 'song.json');

    const metadata = { clipId: '123', style: 'Jazz' };
    fs.writeFileSync(audioPath, 'audio data');
    fs.writeFileSync(metaPath, JSON.stringify(metadata));

    const loaded = loadMetadata(audioPath);
    expect(loaded).toEqual(metadata);
  });

  test('returns null when metadata file missing', () => {
    const audioPath = path.join(TEST_DIR, 'song.wav');
    fs.writeFileSync(audioPath, 'audio data');

    const loaded = loadMetadata(audioPath);
    expect(loaded).toBeNull();
  });

  test('returns null on invalid JSON', () => {
    const audioPath = path.join(TEST_DIR, 'song.wav');
    const metaPath = path.join(TEST_DIR, 'song.json');

    fs.writeFileSync(audioPath, 'audio data');
    fs.writeFileSync(metaPath, 'invalid json {');

    const loaded = loadMetadata(audioPath);
    expect(loaded).toBeNull();
  });
});

describe('organizeFile', () => {
  test('moves file to target path', () => {
    const sourceFile = path.join(TEST_DIR, 'song.wav');
    const targetDir = path.join(TEST_DIR, 'organized');
    const targetFile = path.join(targetDir, 'song.wav');

    fs.writeFileSync(sourceFile, 'audio data');

    const result = organizeFile(sourceFile, targetFile, { move: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(targetFile)).toBe(true);
    expect(fs.existsSync(sourceFile)).toBe(false);
  });

  test('copies file instead of moving', () => {
    const sourceFile = path.join(TEST_DIR, 'song.wav');
    const targetDir = path.join(TEST_DIR, 'organized');
    const targetFile = path.join(targetDir, 'song.wav');

    fs.writeFileSync(sourceFile, 'audio data');

    const result = organizeFile(sourceFile, targetFile, { move: false });
    expect(result.success).toBe(true);
    expect(fs.existsSync(targetFile)).toBe(true);
    expect(fs.existsSync(sourceFile)).toBe(true);
  });

  test('moves metadata file along with audio', () => {
    const sourceFile = path.join(TEST_DIR, 'song.wav');
    const sourceMetaFile = path.join(TEST_DIR, 'song.json');
    const targetDir = path.join(TEST_DIR, 'organized');
    const targetFile = path.join(targetDir, 'song.wav');
    const targetMetaFile = path.join(targetDir, 'song.json');

    fs.writeFileSync(sourceFile, 'audio data');
    fs.writeFileSync(sourceMetaFile, '{"clipId":"123"}');

    const result = organizeFile(sourceFile, targetFile, { move: true, keepMetadata: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(targetMetaFile)).toBe(true);
    expect(fs.existsSync(sourceMetaFile)).toBe(false);
  });

  test('handles non-existent source file', () => {
    const result = organizeFile('/nonexistent/file.wav', '/target/file.wav');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('not found');
  });

  test('recognizes when file already in target location', () => {
    const filePath = path.join(TEST_DIR, 'song.wav');
    fs.writeFileSync(filePath, 'audio data');

    const result = organizeFile(filePath, filePath);
    expect(result.success).toBe(true);
  });
});

describe('organizeDirectory', () => {
  test('organizes multiple files by date', () => {
    const sourceDir = path.join(TEST_DIR, 'source');
    const targetDir = path.join(TEST_DIR, 'organized');
    fs.mkdirSync(sourceDir);

    // Create test files
    const metadata = { downloadedAt: '2026-04-15T10:30:00Z' };
    fs.writeFileSync(path.join(sourceDir, 'song1.wav'), 'audio1');
    fs.writeFileSync(path.join(sourceDir, 'song1.json'), JSON.stringify(metadata));
    fs.writeFileSync(path.join(sourceDir, 'song2.wav'), 'audio2');
    fs.writeFileSync(path.join(sourceDir, 'song2.json'), JSON.stringify(metadata));

    const result = organizeDirectory(sourceDir, targetDir, 'date', { move: true });
    expect(result.organized).toBe(2);
    expect(result.failed).toBe(0);
    expect(fs.existsSync(path.join(targetDir, '2026-04-15', 'song1.wav'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, '2026-04-15', 'song2.wav'))).toBe(true);
  });

  test('skips non-audio files', () => {
    const sourceDir = path.join(TEST_DIR, 'source');
    const targetDir = path.join(TEST_DIR, 'organized');
    fs.mkdirSync(sourceDir);

    fs.writeFileSync(path.join(sourceDir, 'song.wav'), 'audio');
    fs.writeFileSync(path.join(sourceDir, 'readme.txt'), 'text');

    const result = organizeDirectory(sourceDir, targetDir, 'date');
    expect(result.organized).toBe(1);
  });
});

describe('getOrganizationStats', () => {
  test('counts files by date', () => {
    const sourceDir = path.join(TEST_DIR, 'source');
    fs.mkdirSync(sourceDir);

    const meta1 = { downloadedAt: '2026-04-15T10:30:00Z' };
    const meta2 = { downloadedAt: '2026-04-16T10:30:00Z' };
    fs.writeFileSync(path.join(sourceDir, 'song1.wav'), 'audio1');
    fs.writeFileSync(path.join(sourceDir, 'song1.json'), JSON.stringify(meta1));
    fs.writeFileSync(path.join(sourceDir, 'song2.wav'), 'audio2');
    fs.writeFileSync(path.join(sourceDir, 'song2.json'), JSON.stringify(meta2));

    const stats = getOrganizationStats(sourceDir, 'date');
    expect(stats['2026-04-15']).toBe(1);
    expect(stats['2026-04-16']).toBe(1);
  });

  test('counts files by genre', () => {
    const sourceDir = path.join(TEST_DIR, 'source');
    fs.mkdirSync(sourceDir);

    fs.writeFileSync(path.join(sourceDir, 'song1.wav'), 'audio1');
    fs.writeFileSync(path.join(sourceDir, 'song1.json'), JSON.stringify({ style: 'Jazz' }));
    fs.writeFileSync(path.join(sourceDir, 'song2.wav'), 'audio2');
    fs.writeFileSync(path.join(sourceDir, 'song2.json'), JSON.stringify({ style: 'Pop' }));

    const stats = getOrganizationStats(sourceDir, 'genre');
    expect(stats.jazz).toBe(1);
    expect(stats.pop).toBe(1);
  });
});
