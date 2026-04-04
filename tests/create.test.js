const { createMockPage, createMockLocator } = require('./mock-page');

jest.mock('../lib/browser', () => ({
  navigateTo: jest.fn().mockResolvedValue(undefined),
  waitForLogin: jest.fn().mockResolvedValue(undefined),
}));

const { runCreate } = require('../lib/create');
const { navigateTo, waitForLogin } = require('../lib/browser');

// Helper: create a mock page where locator().nth() works for the style textarea loop
function createAdvancedMockPage() {
  const page = createMockPage();
  const fills = [];
  const clicks = [];

  // Track all locator calls
  const locatorCalls = [];

  page.locator = jest.fn((sel) => {
    locatorCalls.push(sel);
    const mock = createMockLocator({ count: 1 });

    // Make nth() work for the style textarea iteration
    mock.nth = jest.fn(() => {
      const nthMock = {
        getAttribute: jest.fn().mockResolvedValue(null),
        scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined),
        click: jest.fn(async () => clicks.push(sel)),
        fill: jest.fn(async (val) => fills.push(val)),
      };
      return nthMock;
    });

    // Override first() to track fills and clicks
    const firstMock = {
      click: jest.fn(async () => clicks.push(sel)),
      fill: jest.fn(async (val) => fills.push(val)),
      scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined),
      waitFor: jest.fn().mockResolvedValue(undefined),
      isDisabled: jest.fn().mockResolvedValue(false),
      evaluate: jest.fn().mockResolvedValue(false), // isActive check
      getAttribute: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
    };
    mock.first = jest.fn().mockReturnValue(firstMock);
    mock.last = jest.fn().mockReturnValue(firstMock);

    return mock;
  });

  return { page, fills, clicks, locatorCalls };
}

describe('runCreate', () => {
  test('navigates to /create and waits for login', async () => {
    const { page } = createAdvancedMockPage();
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123-def']);

    await runCreate(page, { prompt: 'a chill lo-fi beat' });
    expect(navigateTo).toHaveBeenCalledWith(page, '/create');
    expect(waitForLogin).toHaveBeenCalledWith(page);
  });

  test('switches to Advanced mode when lyrics provided', async () => {
    const { page, locatorCalls } = createAdvancedMockPage();
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { lyrics: 'Hello world', style: 'pop' });

    const advancedCall = locatorCalls.find(s => s.includes('Advanced'));
    expect(advancedCall).toBeDefined();
  });

  test('sets lyrics when provided', async () => {
    const { page, fills } = createAdvancedMockPage();
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { lyrics: 'Verse 1 lyrics here' });

    expect(fills).toContain('Verse 1 lyrics here');
  });

  test('sets title when provided', async () => {
    const { page, fills } = createAdvancedMockPage();
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { title: 'My Track' });

    expect(fills).toContain('My Track');
  });

  test('returns ok with clipId when track appears', async () => {
    const { page } = createAdvancedMockPage();
    page.evaluate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['new-clip-id-123']);

    const result = await runCreate(page, { prompt: 'test' });
    expect(result.status).toBe('ok');
    expect(result.clipId).toBe('new-clip-id-123');
  });

  test('enables instrumental mode when flag set', async () => {
    const { page, clicks } = createAdvancedMockPage();
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { instrumental: true, prompt: 'beats' });

    // Should click the instrumental button (aria-label or text based)
    const instrClick = clicks.find(s =>
      s.includes('instrumental') || s.includes('Instrumental')
    );
    expect(instrClick).toBeDefined();
  });

  test('selects voice when provided', async () => {
    const { page, clicks } = createAdvancedMockPage();
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { voice: 'My Voice 1', prompt: 'test' });

    const voiceClick = clicks.find(s => s.includes('Voice'));
    expect(voiceClick).toBeDefined();
  });

  test('selects model version when provided', async () => {
    const { page, clicks } = createAdvancedMockPage();
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { model: 'v4', prompt: 'test' });

    const modelClick = clicks.find(s => s.includes('v4') || s.includes('v5') || s.includes('v3'));
    expect(modelClick).toBeDefined();
  });

  test('uses Create song button with aria-label', async () => {
    const { page, clicks } = createAdvancedMockPage();
    page.evaluate.mockResolvedValueOnce([]).mockResolvedValue(['abc-123']);

    await runCreate(page, { prompt: 'test' });

    const createClick = clicks.find(s => s.includes('Create song') || s.includes('Create'));
    expect(createClick).toBeDefined();
  });
});
