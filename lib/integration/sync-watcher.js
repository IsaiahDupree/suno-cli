/**
 * Library Sync Watcher
 * Automatically syncs newly generated songs to MusicLibrary
 */

const fs = require('fs');
const path = require('path');
const songModel = require('../db/models/song');
const musicLibrarySync = require('./music-library-sync');
const metadataEnrichment = require('./metadata-enrichment');
const Logger = require('../logger');

const logger = new Logger();

class SyncWatcher {
  constructor() {
    this.watching = false;
    this.watchInterval = null;
    this.lastCheck = 0;
  }

  /**
   * Start watching for new songs to sync
   * @param {object} options - Watch options
   */
  start(options = {}) {
    const {
      checkIntervalMs = 30000, // Check every 30 seconds
      autoEnrich = true,
    } = options;

    if (this.watching) {
      logger.warn('Watcher already running');
      return;
    }

    if (!musicLibrarySync.libraryPath && !musicLibrarySync.initialize()) {
      logger.error('Cannot start watcher - MusicLibrary not configured');
      return;
    }

    this.watching = true;
    this.autoEnrich = autoEnrich;

    logger.info('Starting MusicLibrary sync watcher...');

    this.watchInterval = setInterval(() => {
      this.checkForNewSongs().catch((error) => {
        logger.error(`Watcher error: ${error.message}`);
      });
    }, checkIntervalMs);
  }

  /**
   * Stop watching
   */
  stop() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    this.watching = false;
    logger.info('MusicLibrary sync watcher stopped');
  }

  /**
   * Check for newly downloaded songs and sync them
   * @returns {Promise<object>} Check results
   */
  async checkForNewSongs() {
    try {
      // Get all songs that haven't been synced yet
      const { songs } = await songModel.getAll(100);

      const unsynced = songs.filter(
        (song) =>
          song.downloaded_at && // Has been downloaded
          !song.synced_to_library, // Not yet synced to library
      );

      if (unsynced.length === 0) {
        return { checked: songs.length, toSync: 0 };
      }

      logger.info(`Found ${unsynced.length} unsynced songs`);

      let synced = 0;
      let failed = 0;

      for (const song of unsynced) {
        try {
          // Enrich metadata if enabled
          if (this.autoEnrich && song.file_path) {
            const audioMetadata = await metadataEnrichment.extractAudioMetadata(
              song.file_path
            );
            const enriched = metadataEnrichment.enrichMetadata(song, audioMetadata);

            // Update song with enriched metadata
            await songModel.update(song.clip_id, {
              genre: enriched.genre,
              mood: enriched.mood,
              energy_level: enriched.energyLevel,
              bpm: enriched.bpm,
              local_metadata: enriched,
            });
          }

          // Sync to library
          const syncSuccess = await musicLibrarySync.syncSong(song);
          if (syncSuccess) {
            synced++;
          } else {
            failed++;
          }
        } catch (error) {
          logger.error(`Failed to sync song ${song.clip_id}: ${error.message}`);
          failed++;
        }
      }

      // Rebuild library index
      if (synced > 0) {
        await musicLibrarySync.rebuildIndex();
      }

      return {
        checked: songs.length,
        toSync: unsynced.length,
        synced,
        failed,
      };
    } catch (error) {
      logger.error(`Check failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Manual trigger to sync pending songs
   * @returns {Promise<object>} Sync results
   */
  async syncPending() {
    try {
      const { songs } = await songModel.getAll(100);

      const unsynced = songs.filter(
        (song) =>
          song.downloaded_at && // Has been downloaded
          !song.synced_to_library, // Not yet synced
      );

      logger.info(`Syncing ${unsynced.length} pending songs...`);

      let synced = 0;
      let failed = 0;

      for (const song of unsynced) {
        try {
          // Enrich if auto-enrich is enabled
          if (this.autoEnrich && song.file_path) {
            const audioMetadata = await metadataEnrichment.extractAudioMetadata(
              song.file_path
            );
            const enriched = metadataEnrichment.enrichMetadata(song, audioMetadata);

            await songModel.update(song.clip_id, {
              genre: enriched.genre,
              mood: enriched.mood,
              energy_level: enriched.energyLevel,
              bpm: enriched.bpm,
              local_metadata: enriched,
            });
          }

          const success = await musicLibrarySync.syncSong(song);
          if (success) {
            synced++;
          } else {
            failed++;
          }
        } catch (error) {
          logger.error(`Sync failed for ${song.clip_id}: ${error.message}`);
          failed++;
        }
      }

      if (synced > 0) {
        await musicLibrarySync.rebuildIndex();
      }

      logger.info(`Sync complete: ${synced} synced, ${failed} failed`);

      return {
        total: unsynced.length,
        synced,
        failed,
      };
    } catch (error) {
      logger.error(`Manual sync failed: ${error.message}`);
      return { error: error.message };
    }
  }

  /**
   * Get watcher status
   * @returns {object} Current status
   */
  getStatus() {
    return {
      watching: this.watching,
      libraryConfigured: !!musicLibrarySync.libraryPath,
      autoEnrich: this.autoEnrich,
    };
  }
}

module.exports = new SyncWatcher();
