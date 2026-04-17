/**
 * Database Configuration
 * Defines schema, tables, and migration metadata
 */

const migrations = [
  {
    id: '001_create_songs_table',
    name: 'Create songs table',
    up: `
      CREATE TABLE IF NOT EXISTS songs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clip_id TEXT UNIQUE NOT NULL,
        title TEXT,
        prompt TEXT,
        format TEXT DEFAULT 'wav',
        duration_seconds INTEGER,
        genre TEXT,
        mood TEXT,
        energy_level INTEGER,
        bpm INTEGER,
        file_path TEXT,
        file_size_bytes INTEGER,
        local_metadata JSONB DEFAULT '{}',
        downloaded_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE,
        INDEX idx_clip_id (clip_id),
        INDEX idx_downloaded_at (downloaded_at),
        INDEX idx_genre (genre),
        INDEX idx_created_at (created_at)
      );
    `,
    down: `DROP TABLE IF EXISTS songs;`,
  },
  {
    id: '002_create_generation_history_table',
    name: 'Create generation history table',
    up: `
      CREATE TABLE IF NOT EXISTS generation_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        song_id UUID REFERENCES songs(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        generation_status TEXT DEFAULT 'pending',
        parameters JSONB DEFAULT '{}',
        generation_time_ms INTEGER,
        result_metadata JSONB DEFAULT '{}',
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        INDEX idx_song_id (song_id),
        INDEX idx_status (generation_status),
        INDEX idx_created_at (created_at)
      );
    `,
    down: `DROP TABLE IF EXISTS generation_history;`,
  },
  {
    id: '003_create_migrations_table',
    name: 'Create migrations tracking table',
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `DROP TABLE IF EXISTS schema_migrations;`,
  },
];

const tables = {
  songs: {
    name: 'songs',
    description: 'Stores generated and downloaded songs with metadata',
    columns: [
      { name: 'id', type: 'uuid', primary: true },
      { name: 'clip_id', type: 'text', unique: true },
      { name: 'title', type: 'text' },
      { name: 'prompt', type: 'text' },
      { name: 'format', type: 'text' },
      { name: 'duration_seconds', type: 'integer' },
      { name: 'genre', type: 'text' },
      { name: 'mood', type: 'text' },
      { name: 'energy_level', type: 'integer' },
      { name: 'bpm', type: 'integer' },
      { name: 'file_path', type: 'text' },
      { name: 'file_size_bytes', type: 'integer' },
      { name: 'local_metadata', type: 'jsonb' },
      { name: 'downloaded_at', type: 'timestamp' },
      { name: 'created_at', type: 'timestamp' },
      { name: 'updated_at', type: 'timestamp' },
      { name: 'deleted_at', type: 'timestamp' },
    ],
  },
  generation_history: {
    name: 'generation_history',
    description: 'Tracks music generation attempts with status and results',
    columns: [
      { name: 'id', type: 'uuid', primary: true },
      { name: 'song_id', type: 'uuid' },
      { name: 'prompt', type: 'text' },
      { name: 'generation_status', type: 'text' },
      { name: 'parameters', type: 'jsonb' },
      { name: 'generation_time_ms', type: 'integer' },
      { name: 'result_metadata', type: 'jsonb' },
      { name: 'error_message', type: 'text' },
      { name: 'created_at', type: 'timestamp' },
      { name: 'completed_at', type: 'timestamp' },
    ],
  },
  schema_migrations: {
    name: 'schema_migrations',
    description: 'Tracks executed database migrations',
    columns: [
      { name: 'id', type: 'text', primary: true },
      { name: 'name', type: 'text' },
      { name: 'executed_at', type: 'timestamp' },
    ],
  },
};

module.exports = {
  migrations,
  tables,
};
