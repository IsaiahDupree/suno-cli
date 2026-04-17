/**
 * Usage Metrics & Analytics
 *
 * Features:
 *   - Track generations, downloads, API calls
 *   - Store metrics in database
 *   - Generate usage reports
 */

const fs = require('fs');
const path = require('path');

const METRICS_DIR = path.join(process.env.HOME || '/tmp', '.suno', 'metrics');

class MetricsCollector {
  constructor(opts = {}) {
    this.enabled = opts.enabled !== false;
    this.db = opts.db || null; // Supabase client for remote storage
    this.ensureMetricsDir();
  }

  /**
   * Ensure metrics directory exists
   */
  ensureMetricsDir() {
    if (!fs.existsSync(METRICS_DIR)) {
      fs.mkdirSync(METRICS_DIR, { recursive: true });
    }
  }

  /**
   * Record a metric event
   */
  recordEvent(eventType, data = {}) {
    if (!this.enabled) return;

    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data,
    };

    // Log locally
    this._logEvent(event);

    // Store in database if available
    if (this.db && typeof this.db.storeMetric === 'function') {
      this.db.storeMetric(event).catch(err => {
        console.error('Failed to store metric:', err.message);
      });
    }
  }

  /**
   * Record generation event
   */
  recordGeneration(prompt, options = {}) {
    this.recordEvent('generation', {
      prompt: prompt.substring(0, 100), // Truncate for privacy
      model: options.model,
      style: options.style,
      duration: options.duration,
      success: true,
    });
  }

  /**
   * Record download event
   */
  recordDownload(clipId, format = 'wav') {
    this.recordEvent('download', {
      clipId,
      format,
      success: true,
    });
  }

  /**
   * Record API call
   */
  recordApiCall(endpoint, method = 'GET', statusCode = 200) {
    this.recordEvent('api_call', {
      endpoint,
      method,
      statusCode,
    });
  }

  /**
   * Record error
   */
  recordError(errorType, message, context = {}) {
    this.recordEvent('error', {
      type: errorType,
      message,
      ...context,
    });
  }

  /**
   * Log event to file
   */
  _logEvent(event) {
    try {
      const metricsFile = path.join(
        METRICS_DIR,
        `metrics-${new Date().toISOString().split('T')[0]}.jsonl`
      );

      const line = JSON.stringify(event) + '\n';
      fs.appendFileSync(metricsFile, line);
    } catch (err) {
      console.error('Failed to log metric:', err.message);
    }
  }

  /**
   * Get metrics summary
   */
  getSummary(days = 7) {
    try {
      const summary = {
        generationCount: 0,
        downloadCount: 0,
        apiCallCount: 0,
        errorCount: 0,
        events: [],
        byType: {},
      };

      const files = fs.readdirSync(METRICS_DIR);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      for (const file of files) {
        const filePath = path.join(METRICS_DIR, file);
        const fileDate = new Date(file.match(/\d{4}-\d{2}-\d{2}/)[0]);

        if (fileDate < cutoffDate) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n');

        for (const line of lines) {
          if (!line) continue;

          try {
            const event = JSON.parse(line);
            summary.events.push(event);
            summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;

            switch (event.type) {
              case 'generation':
                summary.generationCount++;
                break;
              case 'download':
                summary.downloadCount++;
                break;
              case 'api_call':
                summary.apiCallCount++;
                break;
              case 'error':
                summary.errorCount++;
                break;
            }
          } catch (err) {
            // Skip invalid lines
          }
        }
      }

      return summary;
    } catch (err) {
      return {
        generationCount: 0,
        downloadCount: 0,
        apiCallCount: 0,
        errorCount: 0,
        events: [],
        byType: {},
        error: err.message,
      };
    }
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(days = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const files = fs.readdirSync(METRICS_DIR);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(METRICS_DIR, file);
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

  /**
   * Export metrics as JSON
   */
  exportMetrics(outputPath, days = 7) {
    try {
      const summary = this.getSummary(days);
      const data = {
        exportDate: new Date().toISOString(),
        period: `${days} days`,
        summary: {
          generationCount: summary.generationCount,
          downloadCount: summary.downloadCount,
          apiCallCount: summary.apiCallCount,
          errorCount: summary.errorCount,
          byType: summary.byType,
        },
        events: summary.events,
      };

      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      return { success: true, path: outputPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = { MetricsCollector };
