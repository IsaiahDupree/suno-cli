/**
 * Create new music on Suno with full optionality.
 *
 * Suno UI modes (as of 2026-04):
 *   - Simple: single prompt textarea
 *   - Advanced: lyrics, style, title, voice, instrumental, model
 *   - Sounds: sound effects / one-shots
 *
 * Supports:
 *   - Prompt/description (simple mode)
 *   - Custom lyrics (advanced mode)
 *   - Style/genre tags
 *   - Exclude styles
 *   - Title
 *   - Instrumental toggle
 *   - Model version selection (v3.5, v4, v5, v5.5)
 *   - Voice selection
 *   - Auto-download after creation
 */
const { navigateTo, waitForLogin } = require('./browser');

async function switchToAdvanced(page) {
  // Suno has tabs: Simple | Advanced | Sounds
  // "Advanced" was previously called "Custom" or "Lyrics"
  const advancedBtn = page.locator('button:has-text("Advanced")');
  if (await advancedBtn.count() > 0) {
    const isActive = await advancedBtn.first().evaluate(el => el.classList.contains('active'));
    if (!isActive) {
      await advancedBtn.first().click();
      await page.waitForTimeout(1500);
      console.log('Switched to Advanced mode.');
    } else {
      console.log('Already in Advanced mode.');
    }
    return true;
  }
  // Fallback: try "Lyrics" or "Custom" (older UI)
  for (const label of ['Lyrics', 'Custom']) {
    const btn = page.locator(`button:has-text("${label}")`);
    if (await btn.count() > 0) {
      await btn.first().click();
      await page.waitForTimeout(1500);
      console.log(`Switched to ${label} mode.`);
      return true;
    }
  }
  console.log('Warning: Could not find Advanced mode toggle.');
  return false;
}

async function runCreate(page, opts = {}) {
  const {
    prompt = null,
    lyrics = null,
    style = null,
    excludeStyle = null,
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

  // Determine which mode to use
  const needsAdvanced = lyrics || style || title || instrumental || voice || excludeStyle;

  if (needsAdvanced) {
    await switchToAdvanced(page);
  }

  // --- Set title ---
  // Note: there are duplicate title inputs (Simple + Advanced panels).
  // The Simple one has visibility:hidden when Advanced is active.
  // Use :visible to target the correct one, and scrollIntoView.
  if (title) {
    console.log(`Setting title: "${title}"`);
    const titleInput = page.locator('input[placeholder*="Song Title"]:visible');
    if (await titleInput.count() > 0) {
      await titleInput.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await titleInput.first().click();
      await titleInput.first().fill('');
      await titleInput.first().fill(title);
      console.log('Title set.');
    } else {
      console.log('Warning: Title input not found.');
    }
    await page.waitForTimeout(500);
  }

  // --- Set lyrics (Advanced mode) ---
  if (lyrics) {
    console.log('Setting lyrics...');
    const lyricsInput = page.locator('textarea[data-testid="lyrics-textarea"]');
    if (await lyricsInput.count() > 0) {
      await lyricsInput.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await lyricsInput.first().click();
      await lyricsInput.first().fill('');
      await lyricsInput.first().fill(lyrics);
      console.log(`Lyrics set (${lyrics.length} chars).`);
    } else {
      const fallback = page.locator('textarea[placeholder*="lyrics"], textarea[placeholder*="Write some"]');
      if (await fallback.count() > 0) {
        await fallback.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await fallback.first().click();
        await fallback.first().fill(lyrics);
        console.log(`Lyrics set via fallback (${lyrics.length} chars).`);
      } else {
        console.log('Warning: Lyrics textarea not found.');
      }
    }
    await page.waitForTimeout(500);
  }

  // --- Set style/genre (Advanced mode) ---
  // The style textarea is the second visible textarea (after lyrics).
  // Its placeholder contains random genre suggestions that change each load.
  if (style) {
    console.log(`Setting style: "${style}"`);
    // Target: visible textareas that are NOT the lyrics one and NOT the Simple mode prompt
    const allTextareas = page.locator('textarea:visible');
    const count = await allTextareas.count();
    let styleSet = false;
    for (let i = 0; i < count; i++) {
      const ta = allTextareas.nth(i);
      const testId = await ta.getAttribute('data-testid').catch(() => null);
      const placeholder = await ta.getAttribute('placeholder').catch(() => '');
      // Skip lyrics textarea and simple-mode prompt textareas
      if (testId === 'lyrics-textarea') continue;
      if (placeholder?.includes('Experimental') || placeholder?.includes('Describe the sound')) continue;
      // This should be the style textarea (has genre-like placeholder)
      await ta.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await ta.click();
      await ta.fill('');
      await ta.fill(style);
      console.log('Style set.');
      styleSet = true;
      break;
    }
    if (!styleSet) {
      console.log('Warning: Style input not found.');
    }
    await page.waitForTimeout(500);
  }

  // --- Exclude styles ---
  if (excludeStyle) {
    console.log(`Setting exclude styles: "${excludeStyle}"`);
    const excludeInput = page.locator('input[placeholder*="Exclude styles"]');
    if (await excludeInput.count() > 0) {
      await excludeInput.first().click();
      await excludeInput.first().fill(excludeStyle);
      console.log('Exclude styles set.');
    }
    await page.waitForTimeout(500);
  }

  // --- Set prompt/description (Simple mode) ---
  if (prompt && !needsAdvanced) {
    console.log(`Setting prompt: "${prompt.slice(0, 80)}..."`);
    // In Simple mode, the prompt textarea has placeholder like "Experimental rai song about..."
    const promptInput = page.locator('textarea[placeholder*="Experimental"], textarea[placeholder*="escribe"], textarea[placeholder*="song about"]');
    if (await promptInput.count() > 0) {
      await promptInput.first().click();
      await promptInput.first().fill('');
      await promptInput.first().fill(prompt);
      console.log('Prompt set.');
    } else {
      console.log('Warning: Prompt input not found.');
    }
    await page.waitForTimeout(500);
  } else if (prompt && needsAdvanced) {
    // In Advanced mode, prompt can also be set if no lyrics provided
    if (!lyrics) {
      console.log(`Setting prompt in Advanced mode: "${prompt.slice(0, 80)}..."`);
      const promptInput = page.locator('textarea[placeholder*="Experimental"], textarea[placeholder*="escribe"]');
      if (await promptInput.count() > 0) {
        await promptInput.first().click();
        await promptInput.first().fill(prompt);
        console.log('Prompt set.');
      }
      await page.waitForTimeout(500);
    }
  }

  // --- Toggle instrumental ---
  if (instrumental) {
    console.log('Enabling instrumental mode...');
    const instrBtn = page.locator('button[aria-label="Enable instrumental mode"]');
    if (await instrBtn.count() > 0) {
      await instrBtn.first().click();
      console.log('Instrumental enabled.');
    } else {
      // Fallback
      const fallback = page.locator('button:has-text("Instrumental")');
      if (await fallback.count() > 0) {
        await fallback.first().click();
        console.log('Instrumental toggled.');
      } else {
        console.log('Warning: Instrumental toggle not found.');
      }
    }
    await page.waitForTimeout(500);
  }

  // --- Select model version ---
  if (model) {
    console.log(`Selecting model: ${model}`);
    // Current model button shows version like "v5.5"
    const currentModelBtn = page.locator('button:has-text("v5"), button:has-text("v4"), button:has-text("v3")');
    if (await currentModelBtn.count() > 0) {
      await currentModelBtn.first().click();
      await page.waitForTimeout(800);
      // Select the requested model from dropdown
      const modelOption = page.locator(`button:has-text("${model}"), [role="option"]:has-text("${model}"), [role="menuitem"]:has-text("${model}")`);
      if (await modelOption.count() > 0) {
        await modelOption.first().click();
        console.log(`Model ${model} selected.`);
      } else {
        console.log(`Warning: Model "${model}" not found. Available models may differ.`);
        await page.keyboard.press('Escape');
      }
    } else {
      console.log('Warning: Model selector not found.');
    }
    await page.waitForTimeout(500);
  }

  // --- Select voice ---
  if (voice) {
    console.log(`Selecting voice: ${voice}`);
    const voiceBtn = page.locator('button[aria-label="Add Voice"]');
    if (await voiceBtn.count() > 0) {
      await voiceBtn.first().click();
      await page.waitForTimeout(1500);
      const voiceOption = page.locator(`button:has-text("${voice}"), [role="option"]:has-text("${voice}")`);
      if (await voiceOption.count() > 0) {
        await voiceOption.first().click();
        console.log(`Voice "${voice}" selected.`);
      } else {
        console.log(`Warning: Voice "${voice}" not found in options.`);
        await page.keyboard.press('Escape');
      }
    } else {
      // Fallback
      const fallback = page.locator('button:has-text("Voice")');
      if (await fallback.count() > 0) {
        await fallback.first().click();
        await page.waitForTimeout(1500);
        const voiceOption = page.locator(`button:has-text("${voice}")`);
        if (await voiceOption.count() > 0) {
          await voiceOption.first().click();
          console.log(`Voice "${voice}" selected.`);
        } else {
          console.log(`Warning: Voice "${voice}" not found.`);
          await page.keyboard.press('Escape');
        }
      }
    }
    await page.waitForTimeout(500);
  }

  // --- Click Create ---
  console.log('Clicking Create...');
  const createBtn = page.locator('button[aria-label="Create song"]');
  if (await createBtn.count() > 0) {
    await createBtn.first().click();
    console.log('Create clicked! Waiting for generation...');
  } else {
    // Fallback
    const fallback = page.locator('button:has-text("Create")').last();
    if (await fallback.count() > 0) {
      await fallback.click();
      console.log('Create clicked (fallback)! Waiting for generation...');
    } else {
      console.log('ERROR: Create button not found.');
      return { status: 'fail', reason: 'Create button not found' };
    }
  }

  // --- Wait for generation ---
  console.log('Waiting for generation to complete (this may take 1-2 minutes)...');
  await page.waitForTimeout(10000);

  // Capture existing clip IDs first, then watch for new ones
  let newClipId = null;
  for (let i = 0; i < 24; i++) { // up to ~2 minutes
    const clips = await page.evaluate(() => {
      const rows = document.querySelectorAll('div.clip-row a[href*="/song/"]');
      return Array.from(rows).map(a => a.href.match(/\/song\/([a-f0-9-]+)/)?.[1]).filter(Boolean);
    });
    if (clips.length > 0) {
      newClipId = clips[0];
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
