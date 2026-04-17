/**
 * Organize music files by date, genre, or custom tags
 */
const fs = require('fs');
const path = require('path');

/**
 * Extract date from filename or metadata
 * @param {string} filePath - Path to the file
 * @param {object} metadata - Metadata JSON object
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function extractDate(filePath, metadata = {}) {
  // Try metadata first
  if (metadata.downloadedAt) {
    return metadata.downloadedAt.split('T')[0];
  }

  // Try filename pattern (common formats: YYYY-MM-DD_...)
  const match = path.basename(filePath).match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  // Fallback to file creation time
  try {
    const stats = fs.statSync(filePath);
    const date = new Date(stats.birthtime);
    return date.toISOString().split('T')[0];
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Extract genre/category from metadata
 * @param {string} filePath - Path to the file
 * @param {object} metadata - Metadata JSON object
 * @returns {string} Genre or 'uncategorized'
 */
function extractGenre(filePath, metadata = {}) {
  if (metadata.style) return metadata.style.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
  if (metadata.genre) return metadata.genre.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
  if (metadata.category) return metadata.category.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
  return 'uncategorized';
}

/**
 * Get organized path for a file
 * @param {string} filePath - Original file path
 * @param {string} baseDir - Base directory for organization
 * @param {string} scheme - Organization scheme: 'date', 'genre', 'date-genre', or 'custom'
 * @param {object} options - { metadata, customPath }
 * @returns {string} Organized file path
 */
function getOrganizedPath(filePath, baseDir, scheme = 'date', options = {}) {
  const { metadata = {}, customPath = null } = options;
  const filename = path.basename(filePath);
  const ext = path.extname(filename);

  if (customPath) {
    return path.join(baseDir, customPath, filename);
  }

  switch (scheme) {
    case 'date': {
      const date = extractDate(filePath, metadata);
      return path.join(baseDir, date, filename);
    }

    case 'genre': {
      const genre = extractGenre(filePath, metadata);
      return path.join(baseDir, genre, filename);
    }

    case 'date-genre': {
      const date = extractDate(filePath, metadata);
      const genre = extractGenre(filePath, metadata);
      return path.join(baseDir, date, genre, filename);
    }

    case 'year-month': {
      const date = extractDate(filePath, metadata);
      const [year, month] = date.split('-');
      return path.join(baseDir, year, month, filename);
    }

    default:
      return path.join(baseDir, filename);
  }
}

/**
 * Load metadata JSON for a file if it exists
 * @param {string} filePath - Path to audio file
 * @returns {object|null} Metadata object or null
 */
function loadMetadata(filePath) {
  const metaPath = filePath.replace(/\.[^.]+$/, '.json');
  if (fs.existsSync(metaPath)) {
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Organize a file by moving it to a new location
 * @param {string} filePath - Original file path
 * @param {string} targetPath - Target file path
 * @param {object} options - { move: boolean, keepMetadata: boolean }
 * @returns {object} { success: boolean, oldPath: string, newPath: string, reason?: string }
 */
function organizeFile(filePath, targetPath, options = {}) {
  const { move = true, keepMetadata = true } = options;

  if (!fs.existsSync(filePath)) {
    return { success: false, oldPath: filePath, newPath: targetPath, reason: 'Source file not found' };
  }

  if (filePath === targetPath) {
    return { success: true, oldPath: filePath, newPath: targetPath, reason: 'File already in target location' };
  }

  try {
    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (move) {
      // Move file
      fs.renameSync(filePath, targetPath);

      // Move metadata file if it exists and keepMetadata is true
      if (keepMetadata) {
        const oldMetaPath = filePath.replace(/\.[^.]+$/, '.json');
        const newMetaPath = targetPath.replace(/\.[^.]+$/, '.json');
        if (fs.existsSync(oldMetaPath)) {
          fs.renameSync(oldMetaPath, newMetaPath);
        }
      }

      return { success: true, oldPath: filePath, newPath: targetPath };
    } else {
      // Copy file
      fs.copyFileSync(filePath, targetPath);

      // Copy metadata if exists
      if (keepMetadata) {
        const oldMetaPath = filePath.replace(/\.[^.]+$/, '.json');
        const newMetaPath = targetPath.replace(/\.[^.]+$/, '.json');
        if (fs.existsSync(oldMetaPath)) {
          fs.copyFileSync(oldMetaPath, newMetaPath);
        }
      }

      return { success: true, oldPath: filePath, newPath: targetPath };
    }
  } catch (err) {
    return { success: false, oldPath: filePath, newPath: targetPath, reason: err.message };
  }
}

/**
 * Organize all files in a directory
 * @param {string} sourceDir - Source directory with files
 * @param {string} targetDir - Target base directory for organization
 * @param {string} scheme - Organization scheme
 * @param {object} options - { move: boolean, extensions: string[], verbose: boolean }
 * @returns {object} { organized: number, failed: number, results: object[] }
 */
function organizeDirectory(sourceDir, targetDir, scheme = 'date', options = {}) {
  const { move = true, extensions = ['.wav', '.mp3'], verbose = false } = options;

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
  }

  const results = [];
  let organized = 0;
  let failed = 0;

  const files = fs.readdirSync(sourceDir);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!extensions.includes(ext)) continue;

    const sourceFile = path.join(sourceDir, file);
    const stats = fs.statSync(sourceFile);
    if (!stats.isFile()) continue;

    const metadata = loadMetadata(sourceFile) || {};
    const newPath = getOrganizedPath(sourceFile, targetDir, scheme, { metadata });
    const result = organizeFile(sourceFile, newPath, { move, keepMetadata: true });

    if (result.success) {
      organized++;
      if (verbose) console.log(`✓ ${file} → ${path.relative(targetDir, newPath)}`);
    } else {
      failed++;
      if (verbose) console.log(`✗ ${file}: ${result.reason}`);
    }

    results.push(result);
  }

  return { organized, failed, results };
}

/**
 * Get organization scheme statistics
 * @param {string} sourceDir - Directory to scan
 * @param {string} scheme - Organization scheme
 * @returns {object} Statistics by category
 */
function getOrganizationStats(sourceDir, scheme = 'date') {
  const stats = {};

  if (!fs.existsSync(sourceDir)) return stats;

  const files = fs.readdirSync(sourceDir);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!['.wav', '.mp3'].includes(ext)) continue;

    const filePath = path.join(sourceDir, file);
    const metadata = loadMetadata(filePath) || {};

    let category = 'uncategorized';
    if (scheme === 'date') {
      category = extractDate(filePath, metadata);
    } else if (scheme === 'genre') {
      category = extractGenre(filePath, metadata);
    } else if (scheme === 'date-genre') {
      const date = extractDate(filePath, metadata);
      const genre = extractGenre(filePath, metadata);
      category = `${date}/${genre}`;
    }

    stats[category] = (stats[category] || 0) + 1;
  }

  return stats;
}

module.exports = {
  extractDate,
  extractGenre,
  getOrganizedPath,
  loadMetadata,
  organizeFile,
  organizeDirectory,
  getOrganizationStats,
};
