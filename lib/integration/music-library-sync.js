/**
 * MusicLibrary Synchronization
 * Syncs generated songs to MusicLibrary for video production
 */

const fs = require('fs');
const path = require('path');
const songModel = require('../db/models/song');
const Logger = require('../logger');

const logger = new Logger();

class MusicLibrarySync {
  /**
   * Initialize music library sync
   * Requires MUSIC_LIBRARY_PATH environment variable
   * @returns {boolean} Initialization success
   */
  initialize() {
    const libraryPath = process.env.MUSIC_LIBRARY_PATH;

    if (!libraryPath) {
      logger.warn('MUSIC_LIBRARY_PATH not set - MusicLibrary sync disabled');
      return false;
    }

    if (!fs.existsSync(libraryPath)) {
      logger.warn(`MusicLibrary path does not exist: ${libraryPath}`);
      return false;
    }

    this.libraryPath = libraryPath;
    return true;
  }

  /**
   * Sync a single song to MusicLibrary
   * @param {object} song - Song object from database
   * @returns {Promise<boolean>} Success status
   */
  async syncSong(song) {
    try {
      if (!this.libraryPath) {
        throw new Error('MusicLibrary not initialized');
      }

      if (!song.file_path || !fs.existsSync(song.file_path)) {
        throw new Error(`Song file not found: ${song.file_path}`);
      }

      // Create library entry metadata
      const libraryEntry = {
        id: song.id,
        clipId: song.clip_id,
        title: song.title,
        prompt: song.prompt,
        format: song.format,
        durationSeconds: song.duration_seconds,
        genre: song.genre,
        mood: song.mood,
        energyLevel: song.energy_level,
        bpm: song.bpm,
        filePath: song.file_path,
        fileSizeBytes: song.file_size_bytes,
        downloadedAt: song.downloaded_at,
        syncedAt: new Date().toISOString(),
        metadata: song.local_metadata,
      };

      // Create library directory structure
      const libraryDir = path.join(this.libraryPath, 'tracks', song.genre || 'uncategorized');
      if (!fs.existsSync(libraryDir)) {
        fs.mkdirSync(libraryDir, { recursive: true });
      }

      // Copy audio file to library
      const libraryFilePath = path.join(
        libraryDir,
        `${song.clip_id}.${song.format || 'wav'}`
      );

      if (!fs.existsSync(libraryFilePath)) {
        fs.copyFileSync(song.file_path, libraryFilePath);
      }

      // Write metadata file
      const metadataPath = path.join(libraryDir, `${song.clip_id}.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(libraryEntry, null, 2));

      // Update song record with sync status
      await songModel.update(song.clip_id, {
        synced_to_library: true,
        library_sync_at: new Date().toISOString(),
      });

      logger.info(`✓ Song synced to MusicLibrary: ${song.title}`);
      return true;
    } catch (error) {
      logger.error(`Failed to sync song to MusicLibrary: ${error.message}`);
      return false;
    }
  }

  /**
   * Sync all songs from database to MusicLibrary
   * @param {number} limit - Max songs to sync
   * @returns {Promise<object>} Sync results
   */
  async syncAll(limit = 100) {
    try {
      if (!this.libraryPath) {
        throw new Error('MusicLibrary not initialized');
      }

      const { songs } = await songModel.getAll(limit);

      logger.info(`Starting MusicLibrary sync for ${songs.length} songs`);

      let synced = 0;
      let failed = 0;

      for (const song of songs) {
        const success = await this.syncSong(song);
        if (success) {
          synced++;
        } else {
          failed++;
        }
      }

      logger.info(`MusicLibrary sync completed: ${synced} synced, ${failed} failed`);

      return {
        total: songs.length,
        synced,
        failed,
      };
    } catch (error) {
      logger.error(`Failed to sync all songs: ${error.message}`);
      return {
        error: error.message,
      };
    }
  }

  /**
   * Scan library and rebuild index
   * @returns {Promise<object>} Index info
   */
  async rebuildIndex() {
    try {
      if (!this.libraryPath) {
        throw new Error('MusicLibrary not initialized');
      }

      const tracksDir = path.join(this.libraryPath, 'tracks');
      if (!fs.existsSync(tracksDir)) {
        fs.mkdirSync(tracksDir, { recursive: true });
      }

      const index = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        genres: {},
        totalTracks: 0,
      };

      // Scan directory structure
      const genres = fs.readdirSync(tracksDir);

      for (const genre of genres) {
        const genreDir = path.join(tracksDir, genre);
        if (!fs.statSync(genreDir).isDirectory()) continue;

        const files = fs.readdirSync(genreDir);
        const audioFiles = files.filter((f) => !f.endsWith('.json'));

        index.genres[genre] = {
          count: audioFiles.length,
          tracks: [],
        };

        // Load metadata for each track
        for (const file of files) {
          if (!file.endsWith('.json')) continue;

          const metadataPath = path.join(genreDir, file);
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

          index.genres[genre].tracks.push({
            id: metadata.id,
            clipId: metadata.clipId,
            title: metadata.title,
            bpm: metadata.bpm,
            mood: metadata.mood,
            energyLevel: metadata.energyLevel,
          });

          index.totalTracks++;
        }
      }

      // Write index file
      const indexPath = path.join(this.libraryPath, 'index.json');
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

      logger.info(`MusicLibrary index rebuilt: ${index.totalTracks} tracks`);
      return index;
    } catch (error) {
      logger.error(`Failed to rebuild index: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get library statistics
   * @returns {object} Library stats
   */
  getStats() {
    try {
      if (!this.libraryPath) {
        return { error: 'MusicLibrary not initialized' };
      }

      const indexPath = path.join(this.libraryPath, 'index.json');
      if (!fs.existsSync(indexPath)) {
        return { error: 'Index not found - run rebuildIndex first' };
      }

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

      return {
        libraryPath: this.libraryPath,
        totalTracks: index.totalTracks,
        genres: Object.keys(index.genres).length,
        genreBreakdown: Object.entries(index.genres).reduce((acc, [genre, data]) => {
          acc[genre] = data.count;
          return acc;
        }, {}),
        lastUpdated: index.generatedAt,
      };
    } catch (error) {
      logger.error(`Failed to get stats: ${error.message}`);
      return { error: error.message };
    }
  }
}

module.exports = new MusicLibrarySync();
