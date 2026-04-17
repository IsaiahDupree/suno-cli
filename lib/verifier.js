/**
 * Verify downloaded audio files for format and integrity
 */
const fs = require('fs');
const path = require('path');

// Audio file magic numbers (first few bytes)
const FILE_SIGNATURES = {
  wav: [0x52, 0x49, 0x46, 0x46], // "RIFF"
  mp3: [
    [0xFF, 0xFB], // MPEG Frame Sync (no CRC)
    [0xFF, 0xFA], // MPEG Frame Sync (with CRC)
    [0xFF, 0xF3], // MPEG Frame Sync (no CRC)
    [0xFF, 0xF2], // MPEG Frame Sync (with CRC)
    [0x49, 0x44, 0x33], // ID3 tag
  ],
};

const MIN_FILE_SIZE = 100000; // 100 KB minimum for audio file
const MAX_FILE_SIZE = 1000000000; // 1 GB maximum (sanity check)

/**
 * Verify file signature (magic bytes) for audio format
 * @param {string} filePath - Path to the audio file
 * @param {string} expectedFormat - Expected format ('wav' or 'mp3')
 * @returns {boolean} True if file signature matches expected format
 */
function verifyFileSignature(filePath, expectedFormat) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    // Read first 4 bytes to check file signature
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    const format = expectedFormat.toLowerCase();

    if (format === 'wav') {
      // WAV files start with "RIFF"
      return (
        buffer[0] === FILE_SIGNATURES.wav[0] &&
        buffer[1] === FILE_SIGNATURES.wav[1] &&
        buffer[2] === FILE_SIGNATURES.wav[2] &&
        buffer[3] === FILE_SIGNATURES.wav[3]
      );
    }

    if (format === 'mp3') {
      // MP3 can have ID3 tag or frame sync
      const id3Match =
        buffer[0] === 0x49 &&
        buffer[1] === 0x44 &&
        buffer[2] === 0x33;

      const frameSyncMatch =
        buffer[0] === 0xff &&
        (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3 || buffer[1] === 0xf2);

      return id3Match || frameSyncMatch;
    }

    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Verify file size is reasonable for audio
 * @param {string} filePath - Path to the audio file
 * @returns {object} { valid: boolean, sizeMB: number, reason?: string }
 */
function verifySizeRange(filePath) {
  if (!fs.existsSync(filePath)) {
    return { valid: false, sizeMB: 0, reason: 'File does not exist' };
  }

  const stats = fs.statSync(filePath);
  const sizeBytes = stats.size;
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

  if (sizeBytes < MIN_FILE_SIZE) {
    return {
      valid: false,
      sizeMB,
      reason: `File too small: ${sizeMB}MB (minimum ${(MIN_FILE_SIZE / 1024 / 1024).toFixed(1)}MB)`,
    };
  }

  if (sizeBytes > MAX_FILE_SIZE) {
    return {
      valid: false,
      sizeMB,
      reason: `File too large: ${sizeMB}MB (maximum ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB)`,
    };
  }

  return { valid: true, sizeMB };
}

/**
 * Verify audio file is valid
 * @param {string} filePath - Path to the audio file
 * @param {string} expectedFormat - Expected format ('wav' or 'mp3')
 * @returns {object} { valid: boolean, format?: string, sizeMB?: number, errors: string[] }
 */
function verifyAudioFile(filePath, expectedFormat = 'wav') {
  const errors = [];
  let format = null;
  let sizeMB = null;

  // Check file exists
  if (!fs.existsSync(filePath)) {
    errors.push('File does not exist');
    return { valid: false, errors };
  }

  // Check size range
  const sizeCheck = verifySizeRange(filePath);
  sizeMB = sizeCheck.sizeMB;
  if (!sizeCheck.valid) {
    errors.push(sizeCheck.reason);
  }

  // Check file signature
  const expectedExt = path.extname(filePath).toLowerCase().slice(1);
  const checkFormat = expectedFormat || expectedExt || 'wav';

  if (verifyFileSignature(filePath, checkFormat)) {
    format = checkFormat;
  } else {
    // Try to detect format from extension or filename
    if (filePath.toLowerCase().includes('.mp3') || expectedExt === 'mp3') {
      if (!verifyFileSignature(filePath, 'mp3')) {
        errors.push(`Invalid ${checkFormat.toUpperCase()} file format (magic bytes don't match)`);
      } else {
        format = 'mp3';
      }
    } else if (filePath.toLowerCase().includes('.wav') || expectedExt === 'wav') {
      errors.push('Invalid WAV file format (missing RIFF header)');
    } else {
      errors.push(`Unable to verify file format (expected ${checkFormat})`);
    }
  }

  return {
    valid: errors.length === 0,
    format: format || checkFormat,
    sizeMB,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Verify and optionally re-download a file
 * @param {string} filePath - Path to the audio file
 * @param {string} expectedFormat - Expected format ('wav' or 'mp3')
 * @param {object} options - { logOutput: boolean }
 * @returns {object} { valid: boolean, format?: string, action?: string }
 */
function verifyOrRepair(filePath, expectedFormat = 'wav', options = {}) {
  const { logOutput = true } = options;
  const result = verifyAudioFile(filePath, expectedFormat);

  if (!result.valid && logOutput) {
    console.error(`⚠️  Verification failed for ${path.basename(filePath)}:`);
    if (result.errors) {
      result.errors.forEach(e => console.error(`   • ${e}`));
    }
    console.error(`   Action: File should be re-downloaded`);
  }

  return result;
}

module.exports = {
  verifyFileSignature,
  verifySizeRange,
  verifyAudioFile,
  verifyOrRepair,
  FILE_SIGNATURES,
  MIN_FILE_SIZE,
  MAX_FILE_SIZE,
};
