/**
 * Retry logic with exponential backoff for failed operations.
 */

/**
 * Retry an async operation with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @param {number} options.backoffMultiplier - Multiplier for exponential backoff (default: 2)
 * @param {Function} options.onRetry - Callback on retry: (attempt, error, nextDelay) => void
 * @returns {Promise} Result of successful function call
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry = null,
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const nextDelay = Math.min(delay, maxDelay);
        if (onRetry) {
          onRetry(attempt + 1, error, nextDelay);
        }

        await new Promise(resolve => setTimeout(resolve, nextDelay));
        delay = Math.floor(delay * backoffMultiplier);
      }
    }
  }

  throw lastError;
}

/**
 * Retry options for download operations
 */
const DOWNLOAD_RETRY_OPTIONS = {
  maxRetries: 2,
  initialDelay: 2000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

module.exports = { retryWithBackoff, DOWNLOAD_RETRY_OPTIONS };
