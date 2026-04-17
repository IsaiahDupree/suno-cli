/**
 * Generation History Model
 * Tracks music generation attempts and results
 */

const supabaseClient = require('../supabase-client');
const Logger = require('../../logger');

const logger = new Logger();

class GenerationHistoryModel {
  /**
   * Record a generation attempt
   * @param {object} historyData - Generation history data
   * @returns {Promise<object>} Created history record
   */
  async create(historyData) {
    try {
      const client = supabaseClient.getClient();

      const { data, error } = await client
        .from('generation_history')
        .insert({
          song_id: historyData.songId,
          prompt: historyData.prompt,
          generation_status: historyData.status || 'pending',
          parameters: historyData.parameters || {},
          result_metadata: historyData.resultMetadata || {},
        })
        .select();

      if (error) throw error;

      logger.info(`Generation history created for prompt: ${historyData.prompt}`);
      return data[0];
    } catch (error) {
      logger.error(`Failed to create generation history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update generation status
   * @param {string} historyId - History record UUID
   * @param {string} status - New status
   * @param {object} updates - Additional fields to update
   * @returns {Promise<object>} Updated record
   */
  async updateStatus(historyId, status, updates = {}) {
    try {
      const client = supabaseClient.getClient();

      const updateData = {
        generation_status: status,
        ...updates,
      };

      // Set completed_at if status is complete/failed
      if (status === 'completed' || status === 'failed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await client
        .from('generation_history')
        .update(updateData)
        .eq('id', historyId)
        .select();

      if (error) throw error;

      logger.info(`Generation status updated to: ${status}`);
      return data[0];
    } catch (error) {
      logger.error(`Failed to update generation status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get generation history by song ID
   * @param {string} songId - Song UUID
   * @returns {Promise<object[]>} Generation history records
   */
  async getBySongId(songId) {
    try {
      const client = supabaseClient.getClient();

      const { data, error } = await client
        .from('generation_history')
        .select('*')
        .eq('song_id', songId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Failed to get generation history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all generation history
   * @param {number} limit - Result limit
   * @param {number} offset - Result offset
   * @returns {Promise<object>} History records with count
   */
  async getAll(limit = 100, offset = 0) {
    try {
      const client = supabaseClient.getClient();

      const { data, error, count } = await client
        .from('generation_history')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        history: data || [],
        total: count || 0,
      };
    } catch (error) {
      logger.error(`Failed to get generation history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get history by status
   * @param {string} status - Generation status
   * @returns {Promise<object[]>} Matching history records
   */
  async getByStatus(status) {
    try {
      const client = supabaseClient.getClient();

      const { data, error } = await client
        .from('generation_history')
        .select('*')
        .eq('generation_status', status)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error(`Failed to get history by status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get generation statistics
   * @returns {Promise<object>} Stats about generations
   */
  async getStats() {
    try {
      const client = supabaseClient.getClient();

      const { data: all, error: allError } = await client
        .from('generation_history')
        .select('generation_status, generation_time_ms');

      if (allError) throw allError;

      const stats = {
        total: all.length,
        completed: all.filter((h) => h.generation_status === 'completed').length,
        failed: all.filter((h) => h.generation_status === 'failed').length,
        pending: all.filter((h) => h.generation_status === 'pending').length,
        avgGenerationTime: 0,
      };

      const completedWithTime = all.filter(
        (h) => h.generation_status === 'completed' && h.generation_time_ms
      );

      if (completedWithTime.length > 0) {
        const totalTime = completedWithTime.reduce((sum, h) => sum + h.generation_time_ms, 0);
        stats.avgGenerationTime = Math.round(totalTime / completedWithTime.length);
      }

      return stats;
    } catch (error) {
      logger.error(`Failed to get generation statistics: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new GenerationHistoryModel();
