/**
 * Delete a track from Suno workspace.
 * Requires clip ID and displays confirmation.
 */
const { navigateTo, waitForLogin } = require('./browser');

async function runDelete(page, opts = {}) {
  const { clipId = null, confirm = false } = opts;

  if (!clipId) {
    console.error('\nERROR: --clip-id is required for delete.');
    return { status: 'error', reason: 'missing --clip-id' };
  }

  await navigateTo(page, '/create');
  await waitForLogin(page);

  console.log(`\n=== Deleting track ${clipId} ===\n`);

  // Find the clip in the list
  const clipRow = page.locator(`div.clip-row:has(a[href*="${clipId}"])`);
  if (await clipRow.count() === 0) {
    console.error(`Track not found: ${clipId}`);
    return { status: 'error', reason: 'track not found' };
  }

  // Get the clip title for confirmation
  const clipTitle = await clipRow.first().evaluate(row => {
    const link = row.querySelector('a[href*="/song/"]');
    const spans = Array.from(row.querySelectorAll('span'));
    for (const s of spans) {
      const t = s.textContent?.trim();
      if (t && t.length > 2 && t.length < 100) {
        return t;
      }
    }
    return 'Unknown';
  });

  // Show confirmation unless --confirm flag
  if (!confirm) {
    console.log(`Track: ${clipTitle}`);
    console.log(`ID: ${clipId}`);
    console.log('\nTo delete, re-run with --confirm flag:');
    console.log(`  node suno-cli.js delete --clip-id ${clipId} --confirm\n`);
    return { status: 'ok', action: 'confirmation_shown', clipId, title: clipTitle };
  }

  // Click the menu button
  const menuBtn = page.locator(`div.clip-row:has(a[href*="${clipId}"]) button.context-menu-button[aria-label="More options"]`);
  if (await menuBtn.count() === 0) {
    console.error('Could not find menu button');
    return { status: 'error', reason: 'menu not found' };
  }

  await menuBtn.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await menuBtn.first().click();
  await page.waitForTimeout(1200);

  // Look for delete option
  const deleteBtn = page.locator('button:has-text("Delete")');
  if (await deleteBtn.count() === 0) {
    await page.keyboard.press('Escape');
    console.error('Delete option not found in menu');
    return { status: 'error', reason: 'delete option not found' };
  }

  await deleteBtn.first().click();
  await page.waitForTimeout(1500);

  // Confirm the deletion if there's a confirmation dialog
  const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Delete"), button.destructive');
  if (await confirmBtn.count() > 0) {
    await confirmBtn.first().click();
    await page.waitForTimeout(2000);
  }

  console.log(`✓ Track deleted! ID: ${clipId}`);
  return { status: 'ok', action: 'deleted', clipId };
}

module.exports = { runDelete };
