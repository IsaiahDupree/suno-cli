/**
 * Metadata Enrichment
 * Enriches song metadata with detected audio characteristics
 */

const fs = require('fs');
const Logger = require('../logger');

const logger = new Logger();

class MetadataEnrichment {
  /**
   * Extract audio metadata from file
   * Analyzes WAV/MP3 file structure to extract metadata
   * @param {string} filePath - Path to audio file
   * @returns {Promise<object>} Extracted metadata
   */
  async extractAudioMetadata(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      const metadata = {
        fileSizeBytes: stats.size,
        fileExtension: filePath.split('.').pop().toLowerCase(),
        extractedAt: new Date().toISOString(),
      };

      // Parse WAV header if applicable
      if (metadata.fileExtension === 'wav') {
        const wavMetadata = await this.parseWavHeader(filePath);
        Object.assign(metadata, wavMetadata);
      }

      return metadata;
    } catch (error) {
      logger.error(`Failed to extract audio metadata: ${error.message}`);
      return {};
    }
  }

  /**
   * Parse WAV file header for duration and channels
   * @param {string} filePath - Path to WAV file
   * @returns {Promise<object>} WAV metadata
   */
  async parseWavHeader(filePath) {
    try {
      const buffer = Buffer.alloc(100);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 100);
      fs.closeSync(fd);

      // Check RIFF header
      if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
        return {};
      }

      // Parse fmt subchunk
      const audioFormat = buffer.readUInt16LE(20);
      const channels = buffer.readUInt16LE(22);
      const sampleRate = buffer.readUInt32LE(24);
      const byteRate = buffer.readUInt32LE(28);
      const dataSize = buffer.readUInt32LE(40);

      const durationSeconds = Math.round(dataSize / byteRate);

      return {
        audioFormat,
        channels,
        sampleRate,
        durationSeconds,
        formatName: this.getAudioFormatName(audioFormat),
      };
    } catch (error) {
      logger.error(`Failed to parse WAV header: ${error.message}`);
      return {};
    }
  }

  /**
   * Get audio format name from code
   * @param {number} format - Audio format code
   * @returns {string} Format name
   */
  getAudioFormatName(format) {
    const formats = {
      1: 'PCM',
      2: 'ADPCM',
      6: 'ALAW',
      7: 'MULAW',
      17: 'IMA_ADPCM',
      20: 'GSM',
      49: 'GSM_FULL_RATE',
    };
    return formats[format] || `Unknown(${format})`;
  }

  /**
   * Detect genre from prompt
   * Simple genre detection based on keywords in prompt
   * @param {string} prompt - Generation prompt
   * @returns {string} Detected genre
   */
  detectGenre(prompt) {
    if (!prompt) return 'uncategorized';

    const lowerPrompt = prompt.toLowerCase();

    const genreKeywords = {
      electronic: [
        'electronic',
        'synth',
        'edm',
        'dubstep',
        'house',
        'techno',
        'dnb',
        'drum',
      ],
      lofi: ['lofi', 'chill', 'lo-fi', 'ambient', 'relaxing', 'study'],
      hiphop: ['hiphop', 'hip hop', 'hip-hop', 'rap', 'trap', 'beats'],
      rock: ['rock', 'metal', 'punk', 'indie', 'guitar'],
      pop: ['pop', 'upbeat', 'catchy', 'dance'],
      jazz: ['jazz', 'smooth', 'swing'],
      classical: ['classical', 'orchestral', 'symphony', 'piano'],
      world: ['world', 'latin', 'reggae', 'african', 'brazilian'],
      ambient: ['ambient', 'drone', 'atmospheric', 'meditation'],
    };

    for (const [genre, keywords] of Object.entries(genreKeywords)) {
      if (keywords.some((kw) => lowerPrompt.includes(kw))) {
        return genre;
      }
    }

    return 'uncategorized';
  }

  /**
   * Detect mood from prompt
   * @param {string} prompt - Generation prompt
   * @returns {string} Detected mood
   */
  detectMood(prompt) {
    if (!prompt) return 'neutral';

    const lowerPrompt = prompt.toLowerCase();

    const moodKeywords = {
      happy: ['happy', 'upbeat', 'cheerful', 'joyful', 'optimistic', 'bright'],
      sad: ['sad', 'melancholic', 'sad', 'gloomy', 'dark', 'depressing'],
      energetic: ['energetic', 'intense', 'powerful', 'aggressive', 'explosive'],
      calm: ['calm', 'peaceful', 'serene', 'relaxing', 'tranquil', 'soothing'],
      mysterious: ['mysterious', 'dark', 'mysterious', 'eerie', 'spooky', 'creepy'],
      romantic: ['romantic', 'romantic', 'sentimental', 'passionate', 'love'],
      playful: ['playful', 'fun', 'silly', 'whimsical', 'quirky'],
    };

    for (const [mood, keywords] of Object.entries(moodKeywords)) {
      if (keywords.some((kw) => lowerPrompt.includes(kw))) {
        return mood;
      }
    }

    return 'neutral';
  }

  /**
   * Estimate energy level from prompt
   * @param {string} prompt - Generation prompt
   * @returns {number} Energy level (1-10)
   */
  estimateEnergyLevel(prompt) {
    if (!prompt) return 5;

    const lowerPrompt = prompt.toLowerCase();

    const highEnergyKeywords = [
      'energetic',
      'intense',
      'aggressive',
      'explosive',
      'powerful',
      'heavy',
    ];
    const lowEnergyKeywords = ['calm', 'relaxing', 'soothing', 'peaceful', 'gentle', 'quiet'];

    const highEnergyCount = highEnergyKeywords.filter((kw) =>
      lowerPrompt.includes(kw)
    ).length;
    const lowEnergyCount = lowEnergyKeywords.filter((kw) => lowerPrompt.includes(kw)).length;

    if (highEnergyCount > lowEnergyCount) {
      return Math.min(10, 7 + highEnergyCount);
    } else if (lowEnergyCount > highEnergyCount) {
      return Math.max(1, 4 - lowEnergyCount);
    }

    return 5;
  }

  /**
   * Estimate BPM from prompt and audio characteristics
   * @param {string} prompt - Generation prompt
   * @param {object} audioMetadata - Audio metadata
   * @returns {number} Estimated BPM
   */
  estimateBPM(prompt, audioMetadata = {}) {
    if (!prompt) return 120;

    const lowerPrompt = prompt.toLowerCase();

    // BPM patterns
    if (
      lowerPrompt.includes('slow') ||
      lowerPrompt.includes('ballad') ||
      lowerPrompt.includes('funeral')
    ) {
      return 60;
    }

    if (lowerPrompt.includes('waltz')) {
      return 90;
    }

    if (
      lowerPrompt.includes('lofi') ||
      lowerPrompt.includes('lo-fi') ||
      lowerPrompt.includes('chill')
    ) {
      return 85;
    }

    if (
      lowerPrompt.includes('house') ||
      lowerPrompt.includes('electronic') ||
      lowerPrompt.includes('edm')
    ) {
      return 128;
    }

    if (
      lowerPrompt.includes('techno') ||
      lowerPrompt.includes('dnb') ||
      lowerPrompt.includes('drum')
    ) {
      return 140;
    }

    if (lowerPrompt.includes('rock') || lowerPrompt.includes('metal')) {
      return 130;
    }

    if (lowerPrompt.includes('jazz')) {
      return 100;
    }

    return 120; // Default
  }

  /**
   * Enrich metadata object with detected characteristics
   * @param {object} metadata - Base metadata
   * @param {object} audioMetadata - Audio file metadata
   * @returns {object} Enriched metadata
   */
  enrichMetadata(metadata, audioMetadata = {}) {
    const prompt = metadata.prompt || '';

    return {
      ...metadata,
      ...audioMetadata,
      genre: metadata.genre || this.detectGenre(prompt),
      mood: metadata.mood || this.detectMood(prompt),
      energyLevel: metadata.energyLevel || this.estimateEnergyLevel(prompt),
      bpm: metadata.bpm || this.estimateBPM(prompt, audioMetadata),
      enrichedAt: new Date().toISOString(),
    };
  }
}

module.exports = new MetadataEnrichment();
