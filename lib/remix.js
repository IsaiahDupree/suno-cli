/**
 * Remix, Extend, and Cover existing Suno tracks.
 *
 * Actions available from track 3-dot menu:
 *   - Remix: Create a variation with modified params
 *   - Extend: Continue the track from a point
 *   - Cover: Re-record in a different style
 *   - Reuse Prompt: Copy the original prompt to create new
 */
const { navigateTo, waitForLogin } = require('./browser');

async function openTrackMenu(page, clipId) {
  // Navigate to the song page to ensure it's visible
  const menuBtn = page.locator(`div.clip-row:has(a[href*="${clipId}"]) button.context-menu-button[aria-label="More options"]`);

  if (await menuBtn.count() === 0) {
    // Try navigating to the song directly
    await navigateTo(page, `/song/${clipId}`, { waitMs: 3000 });
    const pageMenuBtn = page.locator('button.context-menu-button[aria-label="More options"]');
    if (await pageMenuBtn.count() > 0) {
      await pageMenuBtn.first().click();
      await page.waitForTimeout(1200);
      return true;
    }
    return false;
  }

  await menuBtn.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await menuBtn.first().click();
  await page.waitForTimeout(1200);
  return true;
}

async function clickMenuAction(page, actionName) {
  const btn = page.locator(`button.context-menu-button:has-text("${actionName}")`);
  if (await btn.count() === 0) {
    // Try broader selectors
    const altBtn = page.locator(`button:has-text("${actionName}"), [role="menuitem"]:has-text("${actionName}")`);
    if (await altBtn.count() > 0) {
      await altBtn.first().click();
      return true;
    }
    return false;
  }
  await btn.first().click();
  return true;
}

async function waitForNewTrack(page, timeoutMs = 120000) {
  console.log('Waiting for new track to generate...');
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const clips = await page.evaluate(() => {
      const rows = document.querySelectorAll('div.clip-row a[href*="/song/"]');
      return Array.from(rows).map(a => a.href.match(/\/song\/([a-f0-9-]+)/)?.[1]).filter(Boolean);
    });
    if (clips.length > 0) return clips[0];
    await page.waitForTimeout(5000);
  }
  return null;
}

async function runRemix(page, opts = {}) {
  const { clipId, lyrics = null, style = null, title = null, voice = null } = opts;

  if (!clipId) {
    console.log('ERROR: --clip-id is required for remix.');
    return { status: 'fail', reason: 'no clip ID' };
  }

  await navigateTo(page, '/create');
  await waitForLogin(page);

  console.log(`\n=== Remixing track ${clipId} ===\n`);

  const opened = await openTrackMenu(page, clipId);
  if (!opened) {
    // Navigate to song page and try Remix button there
    await navigateTo(page, `/song/${clipId}`, { waitMs: 3000 });
    const remixBtn = page.locator('button:has-text("Remix")');
    if (await remixBtn.count() > 0) {
      await remixBtn.first().click();
      await page.waitForTimeout(2000);
    } else {
      console.log('ERROR: Could not find track or Remix option.');
      return { status: 'fail', reason: 'track not found' };
    }
  } else {
    const clicked = await clickMenuAction(page, 'Remix');
    if (!clicked) {
      await page.keyboard.press('Escape');
      console.log('ERROR: Remix option not available.');
      return { status: 'fail', reason: 'Remix not in menu' };
    }
  }

  await page.waitForTimeout(2000);
  console.log('Remix dialog opened.');

  // Modify fields if provided
  if (lyrics) {
    console.log('Updating lyrics...');
    const lyricsInput = page.locator('textarea[placeholder*="yrics"], textarea[placeholder*="rite your"], div[contenteditable="true"][class*="lyric"]');
    if (await lyricsInput.count() > 0) {
      await lyricsInput.first().click();
      await lyricsInput.first().fill('');
      await lyricsInput.first().fill(lyrics);
    }
  }

  if (style) {
    console.log(`Setting style: "${style}"`);
    const styleInput = page.locator('textarea[placeholder*="tyle"], input[placeholder*="tyle"]');
    if (await styleInput.count() > 0) {
      await styleInput.first().click();
      await styleInput.first().fill('');
      await styleInput.first().fill(style);
    }
  }

  if (title) {
    console.log(`Setting title: "${title}"`);
    const titleInput = page.locator('input[placeholder*="itle"]');
    if (await titleInput.count() > 0) {
      await titleInput.first().click();
      await titleInput.first().fill('');
      await titleInput.first().fill(title);
    }
  }

  if (voice) {
    console.log(`Selecting voice: ${voice}`);
    const voiceBtn = page.locator('button:has-text("Voice"), button:has-text("My Voice")');
    if (await voiceBtn.count() > 0) {
      await voiceBtn.first().click();
      await page.waitForTimeout(1000);
      const voiceOption = page.locator(`button:has-text("${voice}"), [role="option"]:has-text("${voice}")`);
      if (await voiceOption.count() > 0) {
        await voiceOption.first().click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
  }

  // Submit remix
  const submitBtn = page.locator('button:has-text("Remix"), button:has-text("Create")').last();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    console.log('Remix submitted.');
  }

  const newId = await waitForNewTrack(page);
  if (newId) {
    console.log(`\n✓ Remix created! ID: ${newId}`);
    console.log(`  View at: https://suno.com/song/${newId}`);
    return { status: 'ok', clipId: newId };
  }

  return { status: 'pending', reason: 'generation in progress' };
}

async function runExtend(page, opts = {}) {
  const { clipId, lyrics = null, style = null } = opts;

  if (!clipId) {
    console.log('ERROR: --clip-id is required for extend.');
    return { status: 'fail', reason: 'no clip ID' };
  }

  await navigateTo(page, '/create');
  await waitForLogin(page);

  console.log(`\n=== Extending track ${clipId} ===\n`);

  const opened = await openTrackMenu(page, clipId);
  if (!opened) {
    await navigateTo(page, `/song/${clipId}`, { waitMs: 3000 });
  }

  const clicked = await clickMenuAction(page, 'Extend');
  if (!clicked) {
    // Try on song page
    await navigateTo(page, `/song/${clipId}`, { waitMs: 3000 });
    const extendBtn = page.locator('button:has-text("Extend")');
    if (await extendBtn.count() > 0) {
      await extendBtn.first().click();
    } else {
      await page.keyboard.press('Escape');
      console.log('ERROR: Extend option not available.');
      return { status: 'fail', reason: 'Extend not in menu' };
    }
  }

  await page.waitForTimeout(2000);
  console.log('Extend dialog opened.');

  if (lyrics) {
    const lyricsInput = page.locator('textarea[placeholder*="yrics"], textarea[placeholder*="ontinue"]');
    if (await lyricsInput.count() > 0) {
      await lyricsInput.first().click();
      await lyricsInput.first().fill(lyrics);
    }
  }

  if (style) {
    const styleInput = page.locator('textarea[placeholder*="tyle"], input[placeholder*="tyle"]');
    if (await styleInput.count() > 0) {
      await styleInput.first().click();
      await styleInput.first().fill('');
      await styleInput.first().fill(style);
    }
  }

  const submitBtn = page.locator('button:has-text("Extend"), button:has-text("Create")').last();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    console.log('Extend submitted.');
  }

  const newId = await waitForNewTrack(page);
  if (newId) {
    console.log(`\n✓ Extended track created! ID: ${newId}`);
    console.log(`  View at: https://suno.com/song/${newId}`);
    return { status: 'ok', clipId: newId };
  }

  return { status: 'pending', reason: 'generation in progress' };
}

async function runCover(page, opts = {}) {
  const { clipId, style = null, voice = null } = opts;

  if (!clipId) {
    console.log('ERROR: --clip-id is required for cover.');
    return { status: 'fail', reason: 'no clip ID' };
  }

  await navigateTo(page, '/create');
  await waitForLogin(page);

  console.log(`\n=== Creating cover of track ${clipId} ===\n`);

  const opened = await openTrackMenu(page, clipId);
  if (!opened) {
    await navigateTo(page, `/song/${clipId}`, { waitMs: 3000 });
  }

  const clicked = await clickMenuAction(page, 'Cover');
  if (!clicked) {
    await navigateTo(page, `/song/${clipId}`, { waitMs: 3000 });
    const coverBtn = page.locator('button:has-text("Cover")');
    if (await coverBtn.count() > 0) {
      await coverBtn.first().click();
    } else {
      await page.keyboard.press('Escape');
      console.log('ERROR: Cover option not available.');
      return { status: 'fail', reason: 'Cover not in menu' };
    }
  }

  await page.waitForTimeout(2000);

  if (style) {
    const styleInput = page.locator('textarea[placeholder*="tyle"], input[placeholder*="tyle"]');
    if (await styleInput.count() > 0) {
      await styleInput.first().click();
      await styleInput.first().fill('');
      await styleInput.first().fill(style);
    }
  }

  if (voice) {
    const voiceBtn = page.locator('button:has-text("Voice"), button:has-text("My Voice")');
    if (await voiceBtn.count() > 0) {
      await voiceBtn.first().click();
      await page.waitForTimeout(1000);
      const voiceOption = page.locator(`button:has-text("${voice}"), [role="option"]:has-text("${voice}")`);
      if (await voiceOption.count() > 0) await voiceOption.first().click();
      else await page.keyboard.press('Escape');
    }
  }

  const submitBtn = page.locator('button:has-text("Cover"), button:has-text("Create")').last();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    console.log('Cover submitted.');
  }

  const newId = await waitForNewTrack(page);
  if (newId) {
    console.log(`\n✓ Cover created! ID: ${newId}`);
    console.log(`  View at: https://suno.com/song/${newId}`);
    return { status: 'ok', clipId: newId };
  }

  return { status: 'pending', reason: 'generation in progress' };
}

module.exports = { runRemix, runExtend, runCover };
