/**
 * Vercel Serverless Function Entry Point
 *
 * This file is used by Vercel to handle API requests
 * Maps HTTP requests to the Suno server handlers
 */

const url = require('url');
const { KeyManager } = require('./lib/api/auth');
const { ErrorReporter } = require('./lib/api/error-reporter');
const { MetricsCollector } = require('./lib/api/metrics');

const auth = new KeyManager();
const errorReporter = new ErrorReporter({ enabled: true });
const metrics = new MetricsCollector({ enabled: true });

/**
 * Health check handler
 */
async function handleHealth(req, res) {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      api: 'ready',
      auth: auth.hasApiKey() ? 'configured' : 'not configured',
      serverless: true,
    },
  };

  res.status(200).json(health);
  metrics.recordApiCall('/api/health', 'GET', 200);
}

/**
 * Metrics handler
 */
async function handleMetrics(req, res) {
  const daysParam = req.query.days || '7';
  const days = parseInt(daysParam);

  const summary = metrics.getSummary(days);

  res.status(200).json({
    period: `${days} days`,
    summary: {
      generationCount: summary.generationCount,
      downloadCount: summary.downloadCount,
      apiCallCount: summary.apiCallCount,
      errorCount: summary.errorCount,
      byType: summary.byType,
    },
  });

  metrics.recordApiCall('/api/metrics', 'GET', 200);
}

/**
 * Error stats handler
 */
async function handleErrors(req, res) {
  const daysParam = req.query.days || '7';
  const days = parseInt(daysParam);

  const stats = errorReporter.getStats(days);

  res.status(200).json({
    period: `${days} days`,
    totalErrors: stats.totalErrors,
    byType: stats.byType,
    byStatus: stats.byStatus,
  });

  metrics.recordApiCall('/api/errors', 'GET', 200);
}

/**
 * Status handler
 */
async function handleStatus(req, res) {
  const status = {
    running: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: 'vercel',
  };

  res.status(200).json(status);
  metrics.recordApiCall('/api/status', 'GET', 200);
}

/**
 * Main handler for all requests
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const pathname = url.parse(req.url, true).pathname;

    // Route requests
    switch (pathname) {
      case '/api/health':
        return handleHealth(req, res);

      case '/api/metrics':
        return handleMetrics(req, res);

      case '/api/errors':
        return handleErrors(req, res);

      case '/api/status':
        return handleStatus(req, res);

      default:
        res.status(404).json({ error: 'Not found' });
    }
  } catch (err) {
    errorReporter.reportError(err, {
      context: 'serverless_handler',
      pathname: req.url,
      method: req.method,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  }
};
