const path = require('path');
const fs = require('fs');
const os = require('os');
const { createMockPage, createMockLocator } = require('./mock-page');

jest.mock('../lib/browser', () => ({
  navigateTo: jest.fn().mockResolvedValue(undefined),
  waitForLogin: jest.fn().mockResolvedValue(undefined),
}));

// We need to test downloadOneClip and the flow logic
const { downloadOneClip, getVisibleClips } = require('../lib/download');

describe('downloadOneClip', () => {
  let page;

  beforeEach(() => {
    jest.clearAllMocks();
    page = createMockPage();
  });

  test('returns skip when clip not in DOM', async () => {
    // 3-dot menu button not found
    page.locator = jest.fn(() => createMockLocator({ count: 0 }));

    const result = await downloadOneClip(page, 'missing-id', 'wav');
    expect(result.status).toBe('skip');
    expect(result.reason).toContain('clip not in DOM');
  });

  test('returns skip when Download option not in menu', async () => {
    let callCount = 0;
    page.locator = jest.fn((sel) => {
      callCount++;
      if (callCount === 1) return createMockLocator({ count: 1 }); // menu button exists
      return createMockLocator({ count: 0 }); // Download button missing
    });

    const result = await downloadOneClip(page, 'test-id', 'wav');
    expect(result.status).toBe('skip');
    expect(result.reason).toContain('no Download option');
  });

  test('requests WAV format by default', async () => {
    const locatorSelectors = [];
    page.locator = jest.fn((sel) => {
      locatorSelectors.push(sel);
      // Menu button, Download button, format button all exist
      if (sel.includes('Download File')) return createMockLocator({ count: 0 });
      return createMockLocator({ count: 1 });
    });
    // Fallback download will fail, that's ok for this test
    page.waitForEvent = jest.fn().mockRejectedValue(new Error('timeout'));

    await downloadOneClip(page, 'test-id', 'wav').catch(() => {});

    const formatCall = locatorSelectors.find(s => s.includes('WAV Audio'));
    expect(formatCall).toBeDefined();
  });

  test('requests MP3 format when specified', async () => {
    const locatorSelectors = [];
    page.locator = jest.fn((sel) => {
      locatorSelectors.push(sel);
      if (sel.includes('Download File')) return createMockLocator({ count: 0 });
      return createMockLocator({ count: 1 });
    });
    page.waitForEvent = jest.fn().mockRejectedValue(new Error('timeout'));

    await downloadOneClip(page, 'test-id', 'mp3').catch(() => {});

    const formatCall = locatorSelectors.find(s => s.includes('MP3 Audio'));
    expect(formatCall).toBeDefined();
  });
});

describe('getVisibleClips', () => {
  test('calls page.evaluate to extract clips', async () => {
    const page = createMockPage();
    page.evaluate = jest.fn().mockResolvedValue([
      { clipId: 'abc-123', title: 'Test Song' },
      { clipId: 'def-456', title: 'Another Song' },
    ]);

    const clips = await getVisibleClips(page);
    expect(clips).toHaveLength(2);
    expect(clips[0].clipId).toBe('abc-123');
    expect(page.evaluate).toHaveBeenCalled();
  });
});
