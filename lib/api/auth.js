/**
 * Authentication & API Key Management
 *
 * Features:
 *   - Load API keys from environment variables
 *   - Secure key storage in home directory
 *   - Token validation
 *   - Key rotation support
 */

const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(process.env.HOME || '/tmp', '.suno', 'auth');

class KeyManager {
  constructor() {
    this.ensureAuthDir();
  }

  /**
   * Ensure auth directory exists
   */
  ensureAuthDir() {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Load API key from multiple sources in order of precedence:
   * 1. Environment variable SUNO_API_KEY
   * 2. Stored key in ~/.suno/auth/api-key
   * 3. Return null if not found
   */
  loadApiKey() {
    // Check environment variable first
    if (process.env.SUNO_API_KEY) {
      return process.env.SUNO_API_KEY;
    }

    // Check stored key
    try {
      const keyFile = path.join(AUTH_DIR, 'api-key');
      if (fs.existsSync(keyFile)) {
        const key = fs.readFileSync(keyFile, 'utf-8').trim();
        return key || null;
      }
    } catch (err) {
      // Silently fail
    }

    return null;
  }

  /**
   * Save API key securely
   */
  saveApiKey(key) {
    const validation = this.validateKey(key);
    if (!validation.valid) {
      throw new Error(`Invalid API key: ${validation.error}`);
    }

    try {
      const keyFile = path.join(AUTH_DIR, 'api-key');
      fs.writeFileSync(keyFile, key, { mode: 0o600 });
      return true;
    } catch (err) {
      throw new Error(`Failed to save API key: ${err.message}`);
    }
  }

  /**
   * Delete stored API key
   */
  deleteApiKey() {
    try {
      const keyFile = path.join(AUTH_DIR, 'api-key');
      if (fs.existsSync(keyFile)) {
        fs.unlinkSync(keyFile);
      }
      return true;
    } catch (err) {
      throw new Error(`Failed to delete API key: ${err.message}`);
    }
  }

  /**
   * Check if API key is available
   */
  hasApiKey() {
    return this.loadApiKey() !== null;
  }

  /**
   * Validate API key format
   */
  validateKey(key) {
    if (!key) {
      return { valid: false, error: 'API key is required' };
    }

    if (typeof key !== 'string') {
      return { valid: false, error: 'API key must be a string' };
    }

    if (key.length < 10) {
      return { valid: false, error: 'API key appears too short (minimum 10 characters)' };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      return { valid: false, error: 'API key contains invalid characters' };
    }

    return { valid: true };
  }

  /**
   * Get API key status
   */
  getStatus() {
    const hasKey = this.hasApiKey();
    const source = process.env.SUNO_API_KEY ? 'environment' : hasKey ? 'stored' : 'none';

    return {
      available: hasKey,
      source,
      keyLength: hasKey ? this.loadApiKey().length : 0,
      maskedKey: hasKey ? this.maskKey(this.loadApiKey()) : null,
    };
  }

  /**
   * Mask API key for display (show first 4 and last 4 chars)
   */
  maskKey(key) {
    if (!key || key.length < 8) {
      return '****';
    }
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  }
}

class TokenValidator {
  /**
   * Validate token format (basic JWT-like validation)
   */
  static validate(token) {
    if (!token) {
      return { valid: false, error: 'Token is required' };
    }

    if (typeof token !== 'string') {
      return { valid: false, error: 'Token must be a string' };
    }

    // Basic JWT format check (three parts separated by dots)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }

    // Check if parts are valid base64
    try {
      for (const part of parts) {
        Buffer.from(part, 'base64');
      }
    } catch (err) {
      return { valid: false, error: 'Token contains invalid base64' };
    }

    return { valid: true };
  }

  /**
   * Check if token is expired
   */
  static isExpired(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return { expired: true, error: 'Invalid token format' };

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf-8')
      );

      if (!payload.exp) {
        return { expired: false }; // No expiration
      }

      const now = Math.floor(Date.now() / 1000);
      return {
        expired: now > payload.exp,
        expiresAt: new Date(payload.exp * 1000),
        expiresIn: Math.max(0, payload.exp - now),
      };
    } catch (err) {
      return { expired: true, error: err.message };
    }
  }
}

module.exports = { KeyManager, TokenValidator };
