/**
 * Configuration command — manage Suno CLI settings.
 *
 * Usage:
 *   suno config                   Show current configuration
 *   suno config --get key         Get a single value
 *   suno config --set key value   Set a value
 *   suno config --reset           Reset to defaults
 */
const { getConfig, setConfig, displayConfig, DEFAULTS } = require('./config-store');

async function runConfig(opts = {}) {
  const { get = null, set = null, value = null, reset = false } = opts;

  if (reset) {
    const { saveConfig } = require('./config-store');
    saveConfig({ ...DEFAULTS });
    console.log('\n✓ Configuration reset to defaults\n');
    displayConfig(DEFAULTS);
    return { status: 'ok', action: 'reset' };
  }

  if (get) {
    const config = getConfig();
    const val = config[get];
    console.log(`${get}: ${val || '(not set)'}`);
    return { status: 'ok', key: get, value: val };
  }

  if (set && value !== null) {
    setConfig(set, value);
    const config = getConfig();
    console.log(`\n✓ ${set} set to: ${value}\n`);
    displayConfig(config);
    return { status: 'ok', action: 'set', key: set, value };
  }

  // Show all config
  const config = getConfig();
  displayConfig(config);
  return { status: 'ok', config };
}

module.exports = { runConfig };
