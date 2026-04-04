const { createMockPage, createMockLocator } = require('./mock-page');

// Mock the browser module so create.js doesn't launch a real browser
jest.mock('../lib/browser', () => ({
  navigateTo: jest.fn().mockResolvedValue(undefined),
  waitForLogin: jest.fn().mockResolvedValue(undefined),
}));

const { runCreate } = require('../lib/create');
const { navigateTo, waitForLogin } = require('../lib/browser');

describe('runCreate', () => {
  let page;

  beforeEach(() => {
    jest.clearAllMocks();
    page = createMockPage();
    // Simulate a new clip appearing after create
    page.evaluate.mockResolvedValueOnce([]) // first check: no clips yet
      .mockResolvedValue(['abc-123-def']); // second check: clip appeared
  });

  test('navigates to /create and waits for login', async () => {
    await runCreate(page, { prompt: 'a chill lo-fi beat' });
    expect(navigateTo).toHaveBeenCalledWith(page, '/create');
    expect(waitForLogin).toHaveBeenCalledWith(page);
  });

  test('switches to Custom mode when lyrics provided', async () => {
    const locatorCalls = [];
    page.locator = jest.fn((sel) => {
      locatorCalls.push(sel);
      return createMockLocator({ count: 1 });
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { lyrics: 'Hello world', style: 'pop' });

    const customCall = locatorCalls.find(s => s.includes('Custom'));
    expect(customCall).toBeDefined();
  });

  test('sets lyrics, style, and title when provided', async () => {
    const fills = [];
    page.locator = jest.fn(() => {
      const mock = createMockLocator({ count: 1 });
      mock.first().fill = jest.fn(async (val) => fills.push(val));
      return mock;
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, {
      lyrics: 'Verse 1 lyrics here',
      style: 'indie rock',
      title: 'My Track',
    });

    expect(fills).toContain('Verse 1 lyrics here');
    expect(fills).toContain('indie rock');
    expect(fills).toContain('My Track');
  });

  test('returns ok with clipId when track appears', async () => {
    page.evaluate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['new-clip-id-123']);

    const result = await runCreate(page, { prompt: 'test' });
    expect(result.status).toBe('ok');
    expect(result.clipId).toBe('new-clip-id-123');
  });

  test('enables instrumental mode when flag set', async () => {
    const clicks = [];
    page.locator = jest.fn((sel) => {
      const mock = createMockLocator({ count: 1 });
      mock.first().click = jest.fn(async () => clicks.push(sel));
      return mock;
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { instrumental: true, prompt: 'beats' });

    const instrClick = clicks.find(s => s.includes('Instrumental'));
    expect(instrClick).toBeDefined();
  });

  test('selects voice when provided', async () => {
    const clicks = [];
    page.locator = jest.fn((sel) => {
      const mock = createMockLocator({ count: 1 });
      mock.first().click = jest.fn(async () => clicks.push(sel));
      return mock;
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { voice: 'My Voice 1', prompt: 'test' });

    const voiceClick = clicks.find(s => s.includes('Voice'));
    expect(voiceClick).toBeDefined();
  });

  test('selects model version when provided', async () => {
    const clicks = [];
    page.locator = jest.fn((sel) => {
      const mock = createMockLocator({ count: 1 });
      mock.first().click = jest.fn(async () => clicks.push(sel));
      return mock;
    });
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { model: 'v4', prompt: 'test' });

    const modelClick = clicks.find(s => s.includes('v4'));
    expect(modelClick).toBeDefined();
  });
});
