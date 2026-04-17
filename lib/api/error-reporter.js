/**
 * Error Reporting & Monitoring
 *
 * Features:
 *   - Capture errors with full context
 *   - Log to file and console
 *   - Optional external error tracking (Sentry, etc.)
 *   - Error analytics
 */

const fs = require('fs');
const path = require('path');

const ERRORS_DIR = path.join(process.env.HOME || '/tmp', '.suno', 'errors');

class ErrorReporter {
  constructor(opts = {}) {
    this.enabled = opts.enabled !== false;
    this.external = opts.external || null; // Sentry client, etc.
    this.onError = opts.onError || null;
    this.ensureErrorDir();
  }

  /**
   * Ensure errors directory exists
   */
  ensureErrorDir() {
    if (!fs.existsSync(ERRORS_DIR)) {
      fs.mkdirSync(ERRORS_DIR, { recursive: true });
    }
  }

  /**
   * Report error with full context
   */
  reportError(error, context = {}) {
    if (!this.enabled) return null;

    const errorRecord = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      type: error.constructor.name,
      context,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd(),
      },
    };

    // Add API error details if applicable
    if (error.status) {
      errorRecord.status = error.status;
    }
    if (error.endpoint) {
      errorRecord.endpoint = error.endpoint;
    }
    if (error.responseData) {
      errorRecord.responseData = error.responseData;
    }

    // Log locally
    this._logError(errorRecord);

    // Send to external service if configured
    if (this.external && typeof this.external.captureException === 'function') {
      try {
        this.external.captureException(error, { extra: context });
      } catch (err) {
        console.error('Failed to send error to external service:', err.message);
      }
    }

    // Call custom handler if provided
    if (this.onError && typeof this.onError === 'function') {
      try {
        this.onError(errorRecord);
      } catch (err) {
        console.error('Error in custom error handler:', err.message);
      }
    }

    return errorRecord;
  }

  /**
   * Log error to file
   */
  _logError(errorRecord) {
    try {
      const errorFile = path.join(
        ERRORS_DIR,
        `errors-${new Date().toISOString().split('T')[0]}.jsonl`
      );

      const line = JSON.stringify(errorRecord) + '\n';
      fs.appendFileSync(errorFile, line);
    } catch (err) {
      console.error('Failed to log error to file:', err.message);
    }
  }

  /**
   * Get error statistics
   */
  getStats(days = 7) {
    try {
      const stats = {
        totalErrors: 0,
        byType: {},
        byStatus: {},
        errors: [],
      };

      const files = fs.readdirSync(ERRORS_DIR);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      for (const file of files) {
        const filePath = path.join(ERRORS_DIR, file);
        const fileDate = new Date(file.match(/\d{4}-\d{2}-\d{2}/)[0]);

        if (fileDate < cutoffDate) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          if (!line) continue;

          try {
            const errorRecord = JSON.parse(line);
            stats.totalErrors++;

            // Count by type
            stats.byType[errorRecord.type] = (stats.byType[errorRecord.type] || 0) + 1;

            // Count by status
            if (errorRecord.status) {
              stats.byStatus[errorRecord.status] = (stats.byStatus[errorRecord.status] || 0) + 1;
            }

            stats.errors.push(errorRecord);
          } catch (err) {
            // Skip invalid lines
          }
        }
      }

      return stats;
    } catch (err) {
      return { totalErrors: 0, byType: {}, byStatus: {}, errors: [], error: err.message };
    }
  }

  /**
   * Clear old error logs
   */
  clearOldErrors(days = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const files = fs.readdirSync(ERRORS_DIR);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(ERRORS_DIR, file);
        const fileDate = new Date(file.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '2000-01-01');

        if (fileDate < cutoffDate) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      return { deletedCount };
    } catch (err) {
      return { error: err.message };
    }
  }
}

module.exports = { ErrorReporter };
