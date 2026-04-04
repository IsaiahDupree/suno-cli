/**
 * Mock Playwright page/context for integration tests.
 * Simulates locator chains, clicks, fills, and download events.
 */

function createMockLocator(opts = {}) {
  const { count = 1, text = '', disabled = false } = opts;
  const locator = {
    count: jest.fn().mockResolvedValue(count),
    first: jest.fn().mockReturnValue({
      click: jest.fn().mockResolvedValue(undefined),
      fill: jest.fn().mockResolvedValue(undefined),
      scrollIntoViewIfNeeded: jest.fn().mockResolvedValue(undefined),
      waitFor: jest.fn().mockResolvedValue(undefined),
      isDisabled: jest.fn().mockResolvedValue(disabled),
      textContent: jest.fn().mockResolvedValue(text),
      evaluate: jest.fn().mockResolvedValue({}),
    }),
    last: jest.fn().mockReturnValue({
      click: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(count),
    }),
    allTextContents: jest.fn().mockResolvedValue([text]),
  };
  // Make first() also chainable like a locator
  Object.assign(locator.first(), locator);
  return locator;
}

function createMockPage(overrides = {}) {
  const locators = {};

  const page = {
    goto: jest.fn().mockResolvedValue(undefined),
    url: jest.fn().mockReturnValue('https://suno.com/create'),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    waitForEvent: jest.fn().mockResolvedValue({
      suggestedFilename: () => 'test-song.wav',
      url: () => 'https://cdn.suno.com/test.wav',
      saveAs: jest.fn().mockResolvedValue(undefined),
    }),
    evaluate: jest.fn().mockResolvedValue([]),
    keyboard: {
      press: jest.fn().mockResolvedValue(undefined),
    },
    locator: jest.fn((selector) => {
      // Return specific mocks for known selectors, or a default
      if (locators[selector]) return locators[selector];
      // Default: element exists
      return createMockLocator({ count: 1 });
    }),
    // For tests to register specific locator behavior
    _setLocator(selector, opts) {
      locators[selector] = createMockLocator(opts);
    },
    _setLocatorRaw(selector, mock) {
      locators[selector] = mock;
    },
    ...overrides,
  };

  return page;
}

function createMockContext(page) {
  return {
    pages: jest.fn().mockReturnValue([page]),
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
}

module.exports = { createMockPage, createMockContext, createMockLocator };
