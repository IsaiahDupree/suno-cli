/**
 * Create new music on Suno with full optionality.
 *
 * Supports:
 *   - Prompt/description (simple mode)
 *   - Custom lyrics
 *   - Style/genre tags
 *   - Title
 *   - Instrumental toggle
 *   - Model version selection (v3, v3.5, v4, v5, etc.)
 *   - Voice selection (if available)
 *   - Auto-download after creation
 */
const { navigateTo, waitForLogin } = require('./browser');

async function runCreate(page, opts = {}) {
  const {
    prompt = null,
    lyrics = null,
    style = null,
    title = null,
    instrumental = false,
    model = null,
    voice = null,
    autoDownload = false,
    format = 'wav',
  } = opts;

  await navigateTo(page, '/create');
  await waitForLogin(page);

  console.log('\n=== Creating new track ===\n');

  // Switch to custom mode if we have lyrics, style, or title
  const needsCustom = lyrics || style || title;
  if (needsCustom) {
    const customToggle = page.locator('button:has-text("Custom")');
    if (await customToggle.count() > 0) {
      await customToggle.first().click();
      await page.waitForTimeout(1000);
      console.log('Switched to Custom mode.');
    }
  }

  // Set lyrics
  if (lyrics) {
    console.log('Setting lyrics...');
    const lyricsInput = page.locator('textarea[placeholder*="yrics"], textarea[placeholder*="rite your"], div[contenteditable="true"][class*="lyric"]');
    if (await lyricsInput.count() > 0) {
      await lyricsInput.first().click();
      await lyricsInput.first().fill('');
      await lyricsInput.first().fill(lyrics);
      console.log(`Lyrics set (${lyrics.length} chars).`);
    } else {
      console.log('Warning: Lyrics input not found.');
    }
    await page.waitForTimeout(500);
  }

  // Set style/genre
  if (style) {
    console.log(`Setting style: "${style}"`);
    const styleInput = page.locator('textarea[placeholder*="tyle"], input[placeholder*="tyle"], textarea[placeholder*="enre"], input[placeholder*="enre"]');
    if (await styleInput.count() > 0) {
      await styleInput.first().click();
      await styleInput.first().fill('');
      await styleInput.first().fill(style);
      console.log('Style set.');
    } else {
      console.log('Warning: Style input not found.');
    }
    await page.waitForTimeout(500);
  }

  // Set title
  if (title) {
    console.log(`Setting title: "${title}"`);
    const titleInput = page.locator('input[placeholder*="itle"], input[placeholder*="ong name"]');
    if (await titleInput.count() > 0) {
      await titleInput.first().click();
      await titleInput.first().fill('');
      await titleInput.first().fill(title);
      console.log('Title set.');
    } else {
      console.log('Warning: Title input not found.');
    }
    await page.waitForTimeout(500);
  }

  // Set prompt/description (simple mode)
  if (prompt && !needsCustom) {
    console.log(`Setting prompt: "${prompt.slice(0, 80)}..."`);
    const promptInput = page.locator('textarea[placeholder*="escribe"], textarea[placeholder*="ong about"], textarea[placeholder*="rompt"]');
    if (await promptInput.count() > 0) {
      await promptInput.first().click();
      await promptInput.first().fill('');
      await promptInput.first().fill(prompt);
      console.log('Prompt set.');
    } else {
      console.log('Warning: Prompt input not found.');
    }
    await page.waitForTimeout(500);
  }

  // Toggle instrumental
  if (instrumental) {
    console.log('Enabling instrumental mode...');
    const instrToggle = page.locator('button:has-text("Instrumental"), label:has-text("Instrumental"), [role="switch"]:near(:text("Instrumental"))');
    if (await instrToggle.count() > 0) {
      await instrToggle.first().click();
      console.log('Instrumental toggled.');
    } else {
      console.log('Warning: Instrumental toggle not found.');
    }
    await page.waitForTimeout(500);
  }

  // Select model version
  if (model) {
    console.log(`Selecting model: ${model}`);
    // Try clicking model selector dropdown
    const modelBtn = page.locator('button:has-text("v3"), button:has-text("v4"), button:has-text("v5"), button[class*="model"]');
    if (await modelBtn.count() > 0) {
      await modelBtn.first().click();
      await page.waitForTimeout(800);
      const modelOption = page.locator(`button:has-text("${model}"), [role="option"]:has-text("${model}"), [role="menuitem"]:has-text("${model}")`);
      if (await modelOption.count() > 0) {
        await modelOption.first().click();
        console.log(`Model ${model} selected.`);
      } else {
        console.log(`Warning: Model "${model}" not found in options.`);
        await page.keyboard.press('Escape');
      }
    } else {
      console.log('Warning: Model selector not found.');
    }
    await page.waitForTimeout(500);
  }

  // Select voice
  if (voice) {
    console.log(`Selecting voice: ${voice}`);
    const voiceBtn = page.locator('button:has-text("Voice"), button:has-text("My Voice")');
    if (await voiceBtn.count() > 0) {
      await voiceBtn.first().click();
      await page.waitForTimeout(1000);
      const voiceOption = page.locator(`button:has-text("${voice}"), [role="option"]:has-text("${voice}")`);
      if (await voiceOption.count() > 0) {
        await voiceOption.first().click();
        console.log(`Voice "${voice}" selected.`);
      } else {
        console.log(`Warning: Voice "${voice}" not found.`);
        await page.keyboard.press('Escape');
      }
    } else {
      console.log('Warning: Voice selector not found.');
    }
    await page.waitForTimeout(500);
  }

  // Click Create button
  console.log('Clicking Create...');
  const createBtn = page.locator('button:has-text("Create")').last();
  if (await createBtn.count() > 0) {
    await createBtn.click();
    console.log('Create clicked! Waiting for generation...');
  } else {
    console.log('ERROR: Create button not found.');
    return { status: 'fail', reason: 'Create button not found' };
  }

  // Wait for track to appear (generation can take 30-120 seconds)
  console.log('Waiting for generation to complete (this may take 1-2 minutes)...');
  await page.waitForTimeout(10000);

  // Watch for new clip row appearing
  let newClipId = null;
  for (let i = 0; i < 24; i++) { // up to ~2 minutes
    const clips = await page.evaluate(() => {
      const rows = document.querySelectorAll('div.clip-row a[href*="/song/"]');
      return Array.from(rows).map(a => a.href.match(/\/song\/([a-f0-9-]+)/)?.[1]).filter(Boolean);
    });
    if (clips.length > 0) {
      newClipId = clips[0]; // newest is usually first
      break;
    }
    await page.waitForTimeout(5000);
  }

  if (newClipId) {
    console.log(`\n✓ Track created! ID: ${newClipId}`);
    console.log(`  View at: https://suno.com/song/${newClipId}`);

    if (autoDownload) {
      console.log('Auto-downloading...');
      const { downloadOneClip } = require('./download');
      await page.waitForTimeout(3000);
      const result = await downloadOneClip(page, newClipId, format);
      if (result.status === 'ok') {
        console.log(`  Downloaded: ${result.file} (${result.sizeMB} MB)`);
      } else {
        console.log(`  Download ${result.status}: ${result.reason}`);
      }
    }

    return { status: 'ok', clipId: newClipId };
  } else {
    console.log('Track may still be generating. Check the browser window.');
    return { status: 'pending', reason: 'generation in progress' };
  }
}

module.exports = { runCreate };
