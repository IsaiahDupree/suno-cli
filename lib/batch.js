/**
 * Batch music generation using the queue system
 */
const fs = require('fs');
const path = require('path');
const { GenerationQueue } = require('./queue');

/**
 * Parse CSV line, handling quoted values properly
 * @param {string} line - CSV line
 * @returns {string[]} Array of values
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

/**
 * Parse CSV or JSON input file with generation requests
 * @param {string} filePath - Path to input file
 * @returns {object[]} Array of generation request objects
 */
function parseInputFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf8');

  if (ext === '.json') {
    return JSON.parse(content);
  }

  if (ext === '.csv') {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const requests = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const req = {};

      headers.forEach((header, idx) => {
        if (header && idx < values.length && values[idx]) {
          req[header] = values[idx];
        }
      });

      if (Object.keys(req).length > 0) requests.push(req);
    }

    return requests;
  }

  // Try to parse as NDJSON (newline-delimited JSON)
  const requests = [];
  const lines = content.split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      requests.push(JSON.parse(line));
    } catch (e) {
      // Skip invalid lines
    }
  }

  if (requests.length > 0) return requests;

  throw new Error(`Unsupported file format: ${ext}. Use .json, .csv, or .ndjson`);
}

/**
 * Queue batch generation requests
 * @param {string} filePath - Path to input file or request data
 * @param {object} options - { isFile, type, queueFile }
 * @returns {object} { queued: number, total: number, requests: object[] }
 */
function queueBatch(filePath, options = {}) {
  const { isFile = true, type = 'create', queueFile = null } = options;

  let requests = [];

  if (isFile) {
    requests = parseInputFile(filePath);
  } else {
    // Assume it's inline JSON string
    requests = JSON.parse(filePath);
  }

  if (!Array.isArray(requests)) {
    requests = [requests];
  }

  const queue = new GenerationQueue(queueFile);
  const queuedIds = [];

  for (const req of requests) {
    const queueType = req.type || type;
    const id = queue.enqueue(queueType, req);
    queuedIds.push(id);
  }

  return {
    queued: queuedIds.length,
    total: requests.length,
    requests: requests.map((req, idx) => ({
      ...req,
      queueId: queuedIds[idx],
    })),
  };
}

/**
 * Monitor batch generation progress
 * @param {object} options - { queueFile, interval, maxWait }
 * @returns {Promise} Resolves when batch completes or times out
 */
async function monitorBatch(options = {}) {
  const { queueFile = null, interval = 5000, maxWait = 3600000 } = options;

  const queue = new GenerationQueue(queueFile);
  const startTime = Date.now();

  console.log('Monitoring batch generation...');
  console.log('='.repeat(50));

  return new Promise((resolve) => {
    const monitor = setInterval(() => {
      const status = queue.getStatus();
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      console.log(
        `[${new Date().toLocaleTimeString()}] ` +
        `Pending: ${status.pending} | ` +
        `Processing: ${status.processing} | ` +
        `Completed: ${status.completed} | ` +
        `Failed: ${status.failed} | ` +
        `(${elapsed}s)`
      );

      // Check if batch is done
      if (status.pending === 0 && status.processing === 0) {
        clearInterval(monitor);
        console.log('='.repeat(50));
        console.log(`Batch complete: ${status.completed} succeeded, ${status.failed} failed`);
        resolve({ ...status, elapsed });
        return;
      }

      // Check timeout
      if (Date.now() - startTime > maxWait) {
        clearInterval(monitor);
        console.log('='.repeat(50));
        console.log(`Batch monitoring timeout after ${elapsed}s`);
        resolve({ ...status, elapsed, timedOut: true });
      }
    }, interval);
  });
}

/**
 * Generate batch results summary
 * @param {object} options - { queueFile }
 * @returns {object} Summary with results
 */
function getBatchSummary(options = {}) {
  const { queueFile = null } = options;

  const queue = new GenerationQueue(queueFile);
  const completed = queue.list({ status: 'completed' });
  const failed = queue.list({ status: 'failed' });
  const pending = queue.list({ status: 'pending' });

  const successRate = completed.length + failed.length > 0
    ? (completed.length / (completed.length + failed.length) * 100).toFixed(1)
    : 0;

  return {
    total: queue.queue.length,
    completed: completed.length,
    failed: failed.length,
    pending: pending.length,
    successRate: `${successRate}%`,
    results: {
      successful: completed.map(item => ({
        id: item.id,
        type: item.type,
        params: item.params,
        generationId: item.result,
        completedAt: new Date(item.completedAt).toISOString(),
      })),
      failed: failed.map(item => ({
        id: item.id,
        type: item.type,
        params: item.params,
        error: item.result,
        failedAt: new Date(item.completedAt).toISOString(),
      })),
    },
  };
}

/**
 * Create example batch file
 * @param {string} filePath - Path to write example file
 * @param {string} format - 'csv' or 'json'
 */
function createExampleBatchFile(filePath, format = 'csv') {
  if (format === 'csv') {
    const csv = `prompt,style,title,model
"A chill lofi hip-hop beat","Lo-Fi Hip-Hop","Chill Vibes","v5.5"
"Upbeat electronic dance music","Electronic","Dancefloor Energy","v5.5"
"Jazz improvisation","Jazz","Midnight Sessions","v5.5"`;
    fs.writeFileSync(filePath, csv);
  } else {
    const json = [
      {
        prompt: 'A chill lofi hip-hop beat',
        style: 'Lo-Fi Hip-Hop',
        title: 'Chill Vibes',
        model: 'v5.5',
      },
      {
        prompt: 'Upbeat electronic dance music',
        style: 'Electronic',
        title: 'Dancefloor Energy',
        model: 'v5.5',
      },
      {
        prompt: 'Jazz improvisation',
        style: 'Jazz',
        title: 'Midnight Sessions',
        model: 'v5.5',
      },
    ];
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
  }
}

module.exports = {
  parseInputFile,
  queueBatch,
  monitorBatch,
  getBatchSummary,
  createExampleBatchFile,
};
