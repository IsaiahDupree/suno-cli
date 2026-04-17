const { createMockPage, createMockLocator } = require('./mock-page');

jest.mock('../lib/browser', () => ({
  navigateTo: jest.fn().mockResolvedValue(undefined),
  waitForLogin: jest.fn().mockResolvedValue(undefined),
}));

const { runDelete } = require('../lib/delete');
const { navigateTo, waitForLogin } = require('../lib/browser');

describe('runDelete', () => {
  it('requires --clip-id', async () => {
    const page = createMockPage();
    const result = await runDelete(page, {});
    expect(result.status).toBe('error');
    expect(result.reason).toBe('missing --clip-id');
  });

  it('returns error when clip not found', async () => {
    const page = createMockPage();
    page.locator = jest.fn().mockReturnValue(createMockLocator({ count: 0 }));
    const result = await runDelete(page, { clipId: 'not-found' });
    expect(result.status).toBe('error');
    expect(result.reason).toBe('track not found');
  });

  it('shows confirmation without --confirm flag', async () => {
    const page = createMockPage();
    const mockLocator = createMockLocator({ count: 1 });
    mockLocator.first().evaluate = jest.fn().mockResolvedValue('My Song');
    page.locator = jest.fn().mockReturnValue(mockLocator);

    const result = await runDelete(page, { clipId: 'abc-123', confirm: false });
    expect(result.action).toBe('confirmation_shown');
    expect(result.clipId).toBe('abc-123');
  });

  it('deletes with --confirm flag', async () => {
    const page = createMockPage();
    const mockLocator = createMockLocator({ count: 1 });
    mockLocator.first().evaluate = jest.fn().mockResolvedValue('My Song');
    page.locator = jest.fn().mockReturnValue(mockLocator);
    page.keyboard = { press: jest.fn().mockResolvedValue() };

    const result = await runDelete(page, { clipId: 'abc-123', confirm: true });
    expect(result.status).toBe('ok');
    expect(result.action).toBe('deleted');
  });
});
