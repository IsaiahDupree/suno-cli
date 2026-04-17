/**
 * Configuration persistence.
 * Stores settings in ~/.suno/config.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.suno');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ensure directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

const DEFAULTS = {
  model: 'v5',
  format: 'wav',
  voice: null,
  style: null,
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    console.warn(`Warning: Could not parse config file: ${e.message}`);
    return { ...DEFAULTS };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getConfig(key) {
  const config = loadConfig();
  return key ? config[key] : config;
}

function setConfig(key, value) {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
  return config;
}

function displayConfig(config) {
  console.log('\n=== Configuration ===\n');
  Object.entries(config).forEach(([key, value]) => {
    console.log(`  ${key}: ${value || '(not set)'}`);
  });
  console.log(`\nConfig file: ${CONFIG_FILE}\n`);
}

module.exports = { loadConfig, saveConfig, getConfig, setConfig, displayConfig, CONFIG_FILE, DEFAULTS };
