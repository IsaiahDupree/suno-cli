/**
 * List tracks visible in the Suno workspace.
 * Scrolls through the virtualized list to collect all track metadata.
 */
const { navigateTo, waitForLogin } = require('./browser');
const { getVisibleClips } = require('./download');

async function runList(page, opts = {}) {
  const { search = null, limit = Infinity, json = false } = opts;

  await navigateTo(page, '/create');
  await waitForLogin(page);

  if (search) {
    const searchInput = page.locator('input[placeholder*="earch"]');
    if (await searchInput.count() > 0) {
      await searchInput.first().click();
      await searchInput.first().fill(search);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    }
  }

  console.log('\n=== Listing tracks ===\n');

  const allClips = [];
  const seenIds = new Set();
  let noNewCount = 0;

  while (allClips.length < limit) {
    const visible = await getVisibleClips(page);
    let foundNew = false;

    for (const clip of visible) {
      if (allClips.length >= limit) break;
      if (seenIds.has(clip.clipId)) continue;
      seenIds.add(clip.clipId);
      foundNew = true;

      // Get extra metadata from the row
      const meta = await page.evaluate((cid) => {
        const row = document.querySelector(`div.clip-row:has(a[href*="${cid}"])`);
        if (!row) return {};
        const spans = Array.from(row.querySelectorAll('span'));
        const texts = spans.map(s => s.textContent?.trim()).filter(Boolean);
        return { allText: texts };
      }, clip.clipId);

      allClips.push({ ...clip, ...meta });

      if (!json) {
        const idx = allClips.length;
        console.log(`  [${idx}] ${clip.title || '(untitled)'}`);
        console.log(`       ID: ${clip.clipId}`);
        console.log(`       URL: https://suno.com/song/${clip.clipId}`);
      }
    }

    if (!foundNew) {
      noNewCount++;
      if (noNewCount >= 5) break;
    } else {
      noNewCount = 0;
    }

    await page.evaluate(() => {
      const scroller = document.querySelector('.clip-browser-list-scroller');
      if (scroller) scroller.scrollBy(0, 400);
    });
    await page.waitForTimeout(2000);
  }

  if (json) {
    console.log(JSON.stringify(allClips, null, 2));
  } else {
    console.log(`\nTotal: ${allClips.length} tracks`);
  }

  return allClips;
}

module.exports = { runList };
