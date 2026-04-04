const { createMockPage, createMockLocator } = require('./mock-page');

jest.mock('../lib/browser', () => ({
  navigateTo: jest.fn().mockResolvedValue(undefined),
  waitForLogin: jest.fn().mockResolvedValue(undefined),
}));

const { runRemix, runExtend, runCover } = require('../lib/remix');

describe('runRemix', () => {
  let page;

  beforeEach(() => {
    jest.clearAllMocks();
    page = createMockPage();
  });

  test('fails without clip-id', async () => {
    const result = await runRemix(page, {});
    expect(result.status).toBe('fail');
    expect(result.reason).toContain('no clip ID');
  });

  test('opens track menu and clicks Remix', async () => {
    const clickedSelectors = [];
    page.locator = jest.fn((sel) => {
      const mock = createMockLocator({ count: 1 });
      mock.first().click = jest.fn(async () => clickedSelectors.push(sel));
      return mock;
    });
    // Simulate track appearing after remix
    page.evaluate
      .mockResolvedValueOnce([]) // first poll: nothing
      .mockResolvedValue(['remix-clip-id']);

    const result = await runRemix(page, { clipId: 'original-123' });
    expect(result.status).toBe('ok');
    expect(result.clipId).toBe('remix-clip-id');

    const remixClick = clickedSelectors.find(s => s.includes('Remix'));
    expect(remixClick).toBeDefined();
  });

  test('sets lyrics and style on remix', async () => {
    const fills = [];
    page.locator = jest.fn(() => {
      const mock = createMockLocator({ count: 1 });
      mock.first().fill = jest.fn(async (val) => fills.push(val));
      return mock;
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['remixed']);

    await runRemix(page, {
      clipId: 'orig-123',
      lyrics: 'New remix lyrics',
      style: 'jazz fusion',
    });

    expect(fills).toContain('New remix lyrics');
    expect(fills).toContain('jazz fusion');
  });
});

describe('runExtend', () => {
  let page;

  beforeEach(() => {
    jest.clearAllMocks();
    page = createMockPage();
  });

  test('fails without clip-id', async () => {
    const result = await runExtend(page, {});
    expect(result.status).toBe('fail');
  });

  test('opens menu and clicks Extend', async () => {
    const clickedSelectors = [];
    page.locator = jest.fn((sel) => {
      const mock = createMockLocator({ count: 1 });
      mock.first().click = jest.fn(async () => clickedSelectors.push(sel));
      return mock;
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['extended-id']);

    const result = await runExtend(page, { clipId: 'orig-123' });
    expect(result.status).toBe('ok');

    const extendClick = clickedSelectors.find(s => s.includes('Extend'));
    expect(extendClick).toBeDefined();
  });
});

describe('runCover', () => {
  let page;

  beforeEach(() => {
    jest.clearAllMocks();
    page = createMockPage();
  });

  test('fails without clip-id', async () => {
    const result = await runCover(page, {});
    expect(result.status).toBe('fail');
  });

  test('opens menu and clicks Cover', async () => {
    const clickedSelectors = [];
    page.locator = jest.fn((sel) => {
      const mock = createMockLocator({ count: 1 });
      mock.first().click = jest.fn(async () => clickedSelectors.push(sel));
      return mock;
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['cover-id']);

    const result = await runCover(page, { clipId: 'orig-123', style: 'acoustic' });
    expect(result.status).toBe('ok');

    const coverClick = clickedSelectors.find(s => s.includes('Cover'));
    expect(coverClick).toBeDefined();
  });

  test('selects voice for cover', async () => {
    const clicks = [];
    page.locator = jest.fn((sel) => {
      const mock = createMockLocator({ count: 1 });
      mock.first().click = jest.fn(async () => clicks.push(sel));
      return mock;
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['cover-id']);

    await runCover(page, { clipId: 'orig', voice: 'My Voice 2' });

    const voiceClick = clicks.find(s => s.includes('Voice'));
    expect(voiceClick).toBeDefined();
  });
});
