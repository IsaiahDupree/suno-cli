const { USER_DATA_DIR } = require('../lib/browser');
const path = require('path');

describe('browser module', () => {
  test('USER_DATA_DIR points to browser-data', () => {
    expect(USER_DATA_DIR).toBe(path.join(__dirname, '..', 'browser-data'));
  });

  test('exports expected functions', () => {
    const browser = require('../lib/browser');
    expect(typeof browser.launchBrowser).toBe('function');
    expect(typeof browser.navigateTo).toBe('function');
    expect(typeof browser.dismissCookieBanner).toBe('function');
    expect(typeof browser.waitForLogin).toBe('function');
  });
});
