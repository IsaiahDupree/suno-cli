/**
 * Database Migration System
 * Handles applying, rolling back, and tracking migrations
 */

const supabaseClient = require('./supabase-client');
const { migrations } = require('./config');
const Logger = require('../logger');

const logger = new Logger();

class Migrator {
  /**
   * Get list of executed migrations
   * @returns {Promise<string[]>} Array of executed migration IDs
   */
  async getExecutedMigrations() {
    try {
      const client = supabaseClient.getClient();
      const { data, error } = await client
        .from('schema_migrations')
        .select('id')
        .order('executed_at', { ascending: true });

      if (error) throw error;

      return data ? data.map((m) => m.id) : [];
    } catch (error) {
      logger.error(`Failed to get executed migrations: ${error.message}`);
      return [];
    }
  }

  /**
   * Get pending migrations
   * @returns {Promise<object[]>} Array of pending migration objects
   */
  async getPendingMigrations() {
    const executed = await this.getExecutedMigrations();
    return migrations.filter((m) => !executed.includes(m.id));
  }

  /**
   * Execute a single migration
   * @param {object} migration - Migration object
   * @returns {Promise<boolean>} Success status
   */
  async runMigration(migration) {
    try {
      const client = supabaseClient.getClient();

      // Execute migration SQL
      const { error: execError } = await client.rpc('exec_sql', {
        sql: migration.up,
      });

      if (execError && execError.code !== 'PGRST204') {
        // PGRST204 is expected for CREATE TABLE IF NOT EXISTS
        throw execError;
      }

      // Record migration as executed
      const { error: recordError } = await client
        .from('schema_migrations')
        .insert({
          id: migration.id,
          name: migration.name,
        });

      if (recordError) throw recordError;

      logger.info(`✓ Migration completed: ${migration.name}`);
      return true;
    } catch (error) {
      logger.error(`✗ Migration failed: ${migration.name} - ${error.message}`);
      return false;
    }
  }

  /**
   * Run all pending migrations
   * @returns {Promise<boolean>} Success status
   */
  async runPending() {
    try {
      const pending = await this.getPendingMigrations();

      if (pending.length === 0) {
        logger.info('No pending migrations');
        return true;
      }

      logger.info(`Found ${pending.length} pending migrations`);

      for (const migration of pending) {
        const success = await this.runMigration(migration);
        if (!success) return false;
      }

      logger.info('All migrations completed successfully');
      return true;
    } catch (error) {
      logger.error(`Migration process failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Rollback a migration
   * @param {string} migrationId - Migration ID to rollback
   * @returns {Promise<boolean>} Success status
   */
  async rollback(migrationId) {
    try {
      const migration = migrations.find((m) => m.id === migrationId);
      if (!migration) {
        throw new Error(`Migration not found: ${migrationId}`);
      }

      const client = supabaseClient.getClient();

      // Execute rollback SQL
      const { error: execError } = await client.rpc('exec_sql', {
        sql: migration.down,
      });

      if (execError) throw execError;

      // Remove migration record
      const { error: deleteError } = await client
        .from('schema_migrations')
        .delete()
        .eq('id', migrationId);

      if (deleteError) throw deleteError;

      logger.info(`✓ Rollback completed: ${migration.name}`);
      return true;
    } catch (error) {
      logger.error(`Rollback failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get migration status
   * @returns {Promise<object>} Migration status info
   */
  async status() {
    try {
      const executed = await this.getExecutedMigrations();
      const pending = await this.getPendingMigrations();

      return {
        total: migrations.length,
        executed: executed.length,
        pending: pending.length,
        executedMigrations: executed,
        pendingMigrations: pending.map((m) => ({
          id: m.id,
          name: m.name,
        })),
      };
    } catch (error) {
      logger.error(`Failed to get migration status: ${error.message}`);
      return {
        total: migrations.length,
        executed: 0,
        pending: migrations.length,
        error: error.message,
      };
    }
  }
}

module.exports = new Migrator();
