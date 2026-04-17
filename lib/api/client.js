/**
 * Suno API Client — Abstraction layer for Suno API interactions
 * Supports both native API (if available) and browser automation fallback
 *
 * Features:
 *   - Retry logic with exponential backoff
 *   - Rate limiting
 *   - Response caching
 *   - Error handling with context
 */

const fs = require('fs');
const path = require('path');

class SunoClient {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.SUNO_API_KEY || null;
    this.baseUrl = opts.baseUrl || 'https://api.suno.ai';
    this.timeout = opts.timeout || 30000;
    this.maxRetries = opts.maxRetries || 3;
    this.retryDelay = opts.retryDelay || 1000;
    this.cacheDir = opts.cacheDir || path.join(process.env.HOME || '/tmp', '.suno', 'cache');
    this.cacheTTL = opts.cacheTTL || 3600000; // 1 hour default

    // Rate limiting configuration
    this.rateLimit = {
      maxRequests: opts.rateLimit?.maxRequests || 10,
      windowMs: opts.rateLimit?.windowMs || 60000, // 1 minute
      requestTimes: [],
    };

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    this.requestQueue = [];
    this.isProcessing = false;
  }

  /**
   * Make authenticated API request with retry and error handling
   */
  async request(method, endpoint, data = null) {
    // Check rate limit
    await this._checkRateLimit();

    const fullUrl = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'suno-cli/1.0.0',
      },
      timeout: this.timeout,
    };

    // Add authentication if API key is available
    if (this.apiKey) {
      options.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (data) {
      options.body = JSON.stringify(data);
    }

    // Check cache first
    const cacheKey = this._getCacheKey(method, endpoint, data);
    const cached = this._getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Retry logic with exponential backoff
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(fullUrl, options);

        if (!response.ok) {
          const errorData = await response.text();
          throw new APIError(
            `API Error: ${response.status} ${response.statusText}`,
            response.status,
            errorData,
            endpoint
          );
        }

        const result = await response.json();

        // Cache successful response
        this._saveToCache(cacheKey, result);

        return result;
      } catch (err) {
        lastError = err;

        // Don't retry on client errors (4xx)
        if (err instanceof APIError && err.status >= 400 && err.status < 500) {
          throw err;
        }

        // Wait before retrying
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * GET request
   */
  async get(endpoint) {
    return this.request('GET', endpoint);
  }

  /**
   * POST request
   */
  async post(endpoint, data) {
    return this.request('POST', endpoint, data);
  }

  /**
   * PUT request
   */
  async put(endpoint, data) {
    return this.request('PUT', endpoint, data);
  }

  /**
   * DELETE request
   */
  async delete(endpoint) {
    return this.request('DELETE', endpoint);
  }

  /**
   * Check and enforce rate limiting
   */
  async _checkRateLimit() {
    const now = Date.now();
    const windowStart = now - this.rateLimit.windowMs;

    // Remove old timestamps
    this.rateLimit.requestTimes = this.rateLimit.requestTimes.filter(
      t => t > windowStart
    );

    // If at limit, wait
    if (this.rateLimit.requestTimes.length >= this.rateLimit.maxRequests) {
      const oldestRequest = this.rateLimit.requestTimes[0];
      const waitTime = oldestRequest + this.rateLimit.windowMs - now;
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this._checkRateLimit(); // Recursive check after waiting
      }
    }

    this.rateLimit.requestTimes.push(now);
  }

  /**
   * Generate cache key for request
   */
  _getCacheKey(method, endpoint, data) {
    const str = `${method}:${endpoint}:${data ? JSON.stringify(data) : ''}`;
    return require('crypto')
      .createHash('md5')
      .update(str)
      .digest('hex');
  }

  /**
   * Get value from cache if not expired
   */
  _getFromCache(key) {
    try {
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      if (!fs.existsSync(cacheFile)) {
        return null;
      }

      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs > this.cacheTTL) {
        fs.unlinkSync(cacheFile);
        return null;
      }

      const data = fs.readFileSync(cacheFile, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  /**
   * Save value to cache
   */
  _saveToCache(key, value) {
    try {
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(value, null, 2));
    } catch (err) {
      // Silently fail cache write
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(this.cacheDir, file));
      });
    } catch (err) {
      // Silently fail
    }
  }

  /**
   * Validate API key format
   */
  static validateApiKey(key) {
    if (!key) return { valid: false, error: 'API key is required' };
    if (typeof key !== 'string') return { valid: false, error: 'API key must be a string' };
    if (key.length < 10) return { valid: false, error: 'API key appears too short' };
    return { valid: true };
  }
}

/**
 * Custom API Error class with context
 */
class APIError extends Error {
  constructor(message, status, responseData, endpoint) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.responseData = responseData;
    this.endpoint = endpoint;
  }

  toString() {
    return `${this.name}: ${this.message} [${this.status}] at ${this.endpoint}`;
  }
}

module.exports = { SunoClient, APIError };
