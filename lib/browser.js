/**
 * Shared browser session management for Suno automation.
 * Uses persistent Chromium context to maintain login state.
 */
const { chromium } = require('playwright');
const path = require('path');

const USER_DATA_DIR = path.join(__dirname, '..', 'browser-data');

async function launchBrowser(opts = {}) {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
    acceptDownloads: true,
    ...opts,
  });
  const page = context.pages()[0] || await context.newPage();
  return { context, page };
}

async function navigateTo(page, urlPath, { waitMs = 5000 } = {}) {
  const url = urlPath.startsWith('http') ? urlPath : `https://suno.com${urlPath}`;
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(waitMs);
  await dismissCookieBanner(page);
}

async function dismissCookieBanner(page) {
  const cookieBtn = page.locator('#onetrust-reject-all-handler');
  if (await cookieBtn.count() > 0) {
    await cookieBtn.click();
    await page.waitForTimeout(1000);
  }
}

async function waitForLogin(page) {
  // Check if we're on a login/auth page and wait for user to log in
  const url = page.url();
  if (url.includes('clerk') || url.includes('sign-in') || url.includes('accounts')) {
    console.log('\n=== Please log in to Suno in the browser window. ===');
    console.log('Waiting for you to complete login...\n');
    await page.waitForURL('**/suno.com/**', { timeout: 300000 });
    await page.waitForTimeout(3000);
    console.log('Login detected. Continuing...');
  }
}

module.exports = { launchBrowser, navigateTo, dismissCookieBanner, waitForLogin, USER_DATA_DIR };
