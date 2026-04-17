const { getConfig, setConfig, loadConfig, DEFAULTS } = require('../lib/config-store');

describe('config-store', () => {
  it('exports DEFAULTS', () => {
    expect(DEFAULTS).toHaveProperty('model');
    expect(DEFAULTS).toHaveProperty('format');
    expect(DEFAULTS.format).toBe('wav');
  });

  it('loadConfig returns defaults when file missing', () => {
    const config = loadConfig();
    expect(config).toHaveProperty('model');
    expect(config).toHaveProperty('format');
    expect(config).toHaveProperty('voice');
  });

  it('getConfig without key returns all config', () => {
    const config = getConfig();
    expect(typeof config).toBe('object');
    expect(config.model).toBeDefined();
  });

  it('setConfig updates a value', () => {
    const result = setConfig('model', 'v4');
    expect(result.model).toBe('v4');
  });

  it('can reset config with defaults', () => {
    const { saveConfig } = require('../lib/config-store');
    saveConfig({ ...DEFAULTS });
    const config = loadConfig();
    expect(config.format).toBe('wav');
  });
});

describe('runConfig', () => {
  it('runConfig without args shows all config', async () => {
    const { runConfig } = require('../lib/config');
    const result = await runConfig({});
    expect(result.status).toBe('ok');
    expect(result.config).toBeDefined();
  });

  it('runConfig --get returns a value', async () => {
    const { runConfig } = require('../lib/config');
    const result = await runConfig({ get: 'model' });
    expect(result.status).toBe('ok');
    expect(result.key).toBe('model');
    expect(result.value).toBeDefined();
  });

  it('runConfig --set updates value', async () => {
    const { runConfig } = require('../lib/config');
    const result = await runConfig({ set: 'model', value: 'v5' });
    expect(result.status).toBe('ok');
    expect(result.action).toBe('set');
    expect(result.key).toBe('model');
  });

  it('runConfig --reset resets to defaults', async () => {
    const { runConfig } = require('../lib/config');
    const result = await runConfig({ reset: true });
    expect(result.status).toBe('ok');
    expect(result.action).toBe('reset');
  });
});
