/**
 * Supabase Client Configuration and Connection Management
 * Provides centralized Supabase initialization and connection pooling
 */

const { createClient } = require('@supabase/supabase-js');

class SupabaseClient {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  /**
   * Initialize Supabase client with environment variables
   * @returns {Promise<void>}
   * @throws {Error} If required environment variables are missing
   */
  async initialize() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase initialization failed: Missing SUPABASE_URL or SUPABASE_KEY environment variables'
      );
    }

    try {
      this.client = createClient(supabaseUrl, supabaseKey);

      // Test connection by making a simple query
      await this.client.from('songs').select('count()').limit(1);
      this.connected = true;
    } catch (error) {
      throw new Error(`Supabase connection failed: ${error.message}`);
    }
  }

  /**
   * Get the initialized Supabase client
   * @returns {object} Supabase client instance
   * @throws {Error} If client is not initialized
   */
  getClient() {
    if (!this.client) {
      throw new Error('Supabase client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Check if client is connected
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Close connection and cleanup
   */
  async close() {
    if (this.client) {
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Perform a health check on Supabase connection
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      if (!this.client) return false;

      const { error } = await this.client
        .from('songs')
        .select('count()')
        .limit(1);

      return !error;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
module.exports = new SupabaseClient();
