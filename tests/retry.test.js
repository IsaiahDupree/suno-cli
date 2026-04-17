/**
 * Tests for retry logic with exponential backoff
 */
const { retryWithBackoff, DOWNLOAD_RETRY_OPTIONS } = require('../lib/retry');

describe('retryWithBackoff', () => {
  test('succeeds immediately when function succeeds', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on failure and succeeds on second attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce('success');

    const result = await retryWithBackoff(fn, { maxRetries: 2, initialDelay: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('fails after max retries exceeded', async () => {
    const testError = new Error('persistent failure');
    const fn = jest.fn().mockRejectedValue(testError);

    await expect(
      retryWithBackoff(fn, { maxRetries: 2, initialDelay: 10 })
    ).rejects.toThrow('persistent failure');

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  test('calls onRetry callback on failure', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const onRetry = jest.fn();

    await retryWithBackoff(fn, {
      maxRetries: 1,
      initialDelay: 1,
      onRetry,
    }).catch(() => {});

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.any(Error),
      expect.any(Number)
    );
  });

  test('provides default retry options', () => {
    expect(DOWNLOAD_RETRY_OPTIONS).toHaveProperty('maxRetries', 2);
    expect(DOWNLOAD_RETRY_OPTIONS).toHaveProperty('initialDelay', 2000);
    expect(DOWNLOAD_RETRY_OPTIONS).toHaveProperty('maxDelay', 10000);
    expect(DOWNLOAD_RETRY_OPTIONS).toHaveProperty('backoffMultiplier', 2);
  });

  test('uses default options when not provided', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);

    expect(result).toBe('success');
  });
});
