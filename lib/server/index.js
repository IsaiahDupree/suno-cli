/**
 * Suno CLI Server — REST API server mode
 *
 * Features:
 *   - Health check endpoint (/api/health)
 *   - Music generation endpoint
 *   - Download management
 *   - Status checking
 */

const http = require('http');
const url = require('url');
const { launchBrowser } = require('../browser');
const { KeyManager } = require('../api/auth');
const { ErrorReporter } = require('../api/error-reporter');
const { MetricsCollector } = require('../api/metrics');

class SunoServer {
  constructor(opts = {}) {
    this.port = opts.port || parseInt(process.env.SUNO_PORT || '3000');
    this.host = opts.host || process.env.SUNO_HOST || 'localhost';
    this.auth = new KeyManager();
    this.errorReporter = new ErrorReporter({ enabled: true });
    this.metrics = new MetricsCollector({ enabled: true });
    this.browser = null;
    this.page = null;
    this.isRunning = false;
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize browser
      const { context, page } = await launchBrowser();
      this.browser = context;
      this.page = page;

      // Create HTTP server
      this.server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });

      // Start listening
      this.server.listen(this.port, this.host, () => {
        this.isRunning = true;
        console.log(`\n✓ Suno server running at http://${this.host}:${this.port}`);
        console.log(`  Health: http://${this.host}:${this.port}/api/health`);
        this.metrics.recordEvent('server_start', { port: this.port });
      });

      // Graceful shutdown
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());
    } catch (err) {
      this.errorReporter.reportError(err, { context: 'server_start' });
      throw err;
    }
  }

  /**
   * Stop the server
   */
  async stop() {
    if (!this.isRunning) return;

    try {
      this.isRunning = false;
      this.metrics.recordEvent('server_stop', {});

      if (this.server) {
        this.server.close();
      }

      if (this.browser) {
        await this.browser.close();
      }

      console.log('\n✓ Server stopped gracefully');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err.message);
      process.exit(1);
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  async _handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json');

    // Handle preflight
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Route requests
      if (pathname === '/api/health') {
        await this._handleHealth(req, res);
      } else if (pathname === '/api/metrics' && method === 'GET') {
        await this._handleMetrics(req, res);
      } else if (pathname === '/api/errors' && method === 'GET') {
        await this._handleErrors(req, res);
      } else if (pathname === '/api/status' && method === 'GET') {
        await this._handleStatus(req, res);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      this.errorReporter.reportError(err, {
        context: 'request_handling',
        pathname,
        method,
      });

      res.writeHead(500);
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: err.message,
      }));
    }
  }

  /**
   * Health check endpoint
   */
  async _handleHealth(req, res) {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        browser: this.page ? 'ready' : 'not ready',
        api: 'ready',
        auth: this.auth.hasApiKey() ? 'configured' : 'not configured',
      },
    };

    res.writeHead(200);
    res.end(JSON.stringify(health, null, 2));
    this.metrics.recordApiCall('/api/health', 'GET', 200);
  }

  /**
   * Metrics endpoint
   */
  async _handleMetrics(req, res) {
    const daysParam = url.parse(req.url, true).query.days || '7';
    const days = parseInt(daysParam);

    const summary = this.metrics.getSummary(days);

    res.writeHead(200);
    res.end(JSON.stringify({
      period: `${days} days`,
      summary: {
        generationCount: summary.generationCount,
        downloadCount: summary.downloadCount,
        apiCallCount: summary.apiCallCount,
        errorCount: summary.errorCount,
        byType: summary.byType,
      },
    }, null, 2));

    this.metrics.recordApiCall('/api/metrics', 'GET', 200);
  }

  /**
   * Error statistics endpoint
   */
  async _handleErrors(req, res) {
    const daysParam = url.parse(req.url, true).query.days || '7';
    const days = parseInt(daysParam);

    const stats = this.errorReporter.getStats(days);

    res.writeHead(200);
    res.end(JSON.stringify({
      period: `${days} days`,
      totalErrors: stats.totalErrors,
      byType: stats.byType,
      byStatus: stats.byStatus,
    }, null, 2));

    this.metrics.recordApiCall('/api/errors', 'GET', 200);
  }

  /**
   * Server status endpoint
   */
  async _handleStatus(req, res) {
    const status = {
      running: this.isRunning,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      port: this.port,
      host: this.host,
    };

    res.writeHead(200);
    res.end(JSON.stringify(status, null, 2));
    this.metrics.recordApiCall('/api/status', 'GET', 200);
  }
}

module.exports = { SunoServer };
