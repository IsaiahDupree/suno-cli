/**
 * Song Model
 * Database operations for song metadata storage and retrieval
 */

const supabaseClient = require('../supabase-client');
const Logger = require('../../logger');

const logger = new Logger();

class SongModel {
  /**
   * Create a new song record
   * @param {object} songData - Song metadata
   * @returns {Promise<object>} Created song record
   */
  async create(songData) {
    try {
      const client = supabaseClient.getClient();

      const { data, error } = await client
        .from('songs')
        .insert({
          clip_id: songData.clipId,
          title: songData.title,
          prompt: songData.prompt,
          format: songData.format || 'wav',
          duration_seconds: songData.durationSeconds,
          genre: songData.genre,
          mood: songData.mood,
          energy_level: songData.energyLevel,
          bpm: songData.bpm,
          file_path: songData.filePath,
          file_size_bytes: songData.fileSizeBytes,
          local_metadata: songData.localMetadata || {},
          downloaded_at: songData.downloadedAt,
        })
        .select();

      if (error) throw error;

      logger.info(`Song created: ${songData.clipId}`);
      return data[0];
    } catch (error) {
      logger.error(`Failed to create song: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a song by clip ID
   * @param {string} clipId - Clip ID
   * @returns {Promise<object>} Song record
   */
  async getByclipId(clipId) {
    try {
      const client = supabaseClient.getClient();

      const { data, error } = await client
        .from('songs')
        .select('*')
        .eq('clip_id', clipId)
        .is('deleted_at', null)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data || null;
    } catch (error) {
      logger.error(`Failed to get song ${clipId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get song by UUID
   * @param {string} id - Song UUID
   * @returns {Promise<object>} Song record
   */
  async getById(id) {
    try {
      const client = supabaseClient.getClient();

      const { data, error } = await client
        .from('songs')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return data || null;
    } catch (error) {
      logger.error(`Failed to get song ${id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a song record
   * @param {string} clipId - Clip ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated song record
   */
  async update(clipId, updates) {
    try {
      const client = supabaseClient.getClient();

      const { data, error } = await client
        .from('songs')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('clip_id', clipId)
        .is('deleted_at', null)
        .select();

      if (error) throw error;

      logger.info(`Song updated: ${clipId}`);
      return data[0];
    } catch (error) {
      logger.error(`Failed to update song: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all songs (active, not deleted)
   * @param {number} limit - Result limit
   * @param {number} offset - Result offset for pagination
   * @returns {Promise<object[]>} Songs array
   */
  async getAll(limit = 100, offset = 0) {
    try {
      const client = supabaseClient.getClient();

      const { data, error, count } = await client
        .from('songs')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        songs: data || [],
        total: count || 0,
      };
    } catch (error) {
      logger.error(`Failed to get all songs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get songs by genre
   * @param {string} genre - Genre name
   * @returns {Promise<object[]>} Songs array
   */
  async getByGenre(genre) {
    try {
      const client = supabaseClient.getClient();

      const { data, error } = await client
        .from('songs')
        .select('*')
        .eq('genre', genre)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Failed to get songs by genre: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a song (soft delete)
   * @param {string} clipId - Clip ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(clipId) {
    try {
      const client = supabaseClient.getClient();

      const { error } = await client
        .from('songs')
        .update({ deleted_at: new Date().toISOString() })
        .eq('clip_id', clipId);

      if (error) throw error;

      logger.info(`Song deleted (soft): ${clipId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete song: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get count of songs in database
   * @returns {Promise<number>} Song count
   */
  async count() {
    try {
      const client = supabaseClient.getClient();

      const { count, error } = await client
        .from('songs')
        .select('*', { count: 'exact' })
        .is('deleted_at', null);

      if (error) throw error;

      return count || 0;
    } catch (error) {
      logger.error(`Failed to count songs: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new SongModel();
