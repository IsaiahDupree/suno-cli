const fs = require('fs');
const path = require('path');
const {
  parseInputFile,
  queueBatch,
  getBatchSummary,
  createExampleBatchFile,
} = require('../lib/batch');

const TEST_DIR = path.join(__dirname, 'tmp-batch');

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    const files = fs.readdirSync(TEST_DIR);
    // Recursively delete all files and directories
    function deleteRecursive(dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
          deleteRecursive(fullPath);
        } else {
          fs.unlinkSync(fullPath);
        }
      }
      fs.rmdirSync(dir);
    }
    deleteRecursive(TEST_DIR);
  }
});

describe('parseInputFile', () => {
  test('parses JSON file', () => {
    const filePath = path.join(TEST_DIR, 'batch.json');
    const requests = [
      { prompt: 'test 1' },
      { prompt: 'test 2' },
    ];
    fs.writeFileSync(filePath, JSON.stringify(requests));

    const result = parseInputFile(filePath);
    expect(result).toEqual(requests);
    expect(result.length).toBe(2);
  });

  test('parses CSV file', () => {
    const filePath = path.join(TEST_DIR, 'batch.csv');
    const csv = `prompt,style
"Test prompt 1","Jazz"
"Test prompt 2","Electronic"`;
    fs.writeFileSync(filePath, csv);

    const result = parseInputFile(filePath);
    expect(result.length).toBe(2);
    expect(result[0].prompt).toBe('Test prompt 1');
    expect(result[0].style).toBe('Jazz');
    expect(result[1].prompt).toBe('Test prompt 2');
  });

  test('parses NDJSON file', () => {
    const filePath = path.join(TEST_DIR, 'batch.ndjson');
    const ndjson = `{"prompt":"test1","style":"Jazz"}
{"prompt":"test2","style":"Electronic"}`;
    fs.writeFileSync(filePath, ndjson);

    const result = parseInputFile(filePath);
    expect(result.length).toBe(2);
    expect(result[0].prompt).toBe('test1');
  });

  test('throws error for non-existent file', () => {
    expect(() => parseInputFile('/nonexistent/file.json')).toThrow('not found');
  });

  test('handles empty CSV files', () => {
    const filePath = path.join(TEST_DIR, 'empty.csv');
    fs.writeFileSync(filePath, 'prompt,style\n');

    const result = parseInputFile(filePath);
    expect(result.length).toBe(0);
  });

  test('handles CSV with empty lines', () => {
    const filePath = path.join(TEST_DIR, 'sparse.csv');
    const csv = `prompt,style
"Test 1","Jazz"

"Test 2","Electronic"`;
    fs.writeFileSync(filePath, csv);

    const result = parseInputFile(filePath);
    expect(result.length).toBe(2);
  });

  test('handles mixed case CSV headers', () => {
    const filePath = path.join(TEST_DIR, 'mixed.csv');
    const csv = `Prompt,Style,Model
"Test 1","Jazz","v5.5"`;
    fs.writeFileSync(filePath, csv);

    const result = parseInputFile(filePath);
    expect(result[0].prompt).toBe('Test 1');
    expect(result[0].style).toBe('Jazz');
    expect(result[0].model).toBe('v5.5');
  });
});

describe('queueBatch', () => {
  test('queues batch from JSON file', () => {
    const filePath = path.join(TEST_DIR, 'batch.json');
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const requests = [
      { prompt: 'test 1' },
      { prompt: 'test 2' },
    ];
    fs.writeFileSync(filePath, JSON.stringify(requests));

    const result = queueBatch(filePath, { isFile: true, queueFile });

    expect(result.queued).toBe(2);
    expect(result.total).toBe(2);
    expect(result.requests.length).toBe(2);
    expect(result.requests[0].queueId).toBeTruthy();
  });

  test('queues batch from inline JSON', () => {
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const jsonString = JSON.stringify([{ prompt: 'test 1' }, { prompt: 'test 2' }]);

    const result = queueBatch(jsonString, { isFile: false, queueFile });

    expect(result.queued).toBe(2);
    expect(result.total).toBe(2);
  });

  test('supports custom request types', () => {
    const filePath = path.join(TEST_DIR, 'batch.json');
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const requests = [
      { clipId: '123' },
      { clipId: '456' },
    ];
    fs.writeFileSync(filePath, JSON.stringify(requests));

    const result = queueBatch(filePath, { isFile: true, type: 'remix', queueFile });

    // Verify queue was created
    expect(fs.existsSync(queueFile)).toBe(true);
    expect(result.queued).toBe(2);
  });

  test('handles single request object', () => {
    const filePath = path.join(TEST_DIR, 'single.json');
    const queueFile = path.join(TEST_DIR, '.queue.json');
    fs.writeFileSync(filePath, JSON.stringify({ prompt: 'test' }));

    const result = queueBatch(filePath, { isFile: true, queueFile });
    expect(result.queued).toBe(1);
  });

  test('generates unique queue IDs for each request', () => {
    const filePath = path.join(TEST_DIR, 'batch.json');
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const requests = [{ prompt: 'test 1' }, { prompt: 'test 2' }];
    fs.writeFileSync(filePath, JSON.stringify(requests));

    const result = queueBatch(filePath, { isFile: true, queueFile });

    const ids = result.requests.map(r => r.queueId);
    expect(new Set(ids).size).toBe(2); // All unique
  });
});

describe('getBatchSummary', () => {
  test('returns summary for empty queue', () => {
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const result = getBatchSummary({ queueFile });

    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.successRate).toBe('0%');
  });

  test('counts items by status', () => {
    const filePath = path.join(TEST_DIR, 'batch.json');
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const requests = [{ prompt: 'test 1' }, { prompt: 'test 2' }, { prompt: 'test 3' }];
    fs.writeFileSync(filePath, JSON.stringify(requests));

    const batch = queueBatch(filePath, { isFile: true, queueFile });
    const { GenerationQueue } = require('../lib/queue');
    const queue = new GenerationQueue(queueFile);

    // Simulate completion of one request
    queue.markCompleted(batch.requests[0].queueId, 'gen-123');
    queue.markFailed(batch.requests[1].queueId, 'Error', false);
    // Third item remains pending

    const summary = getBatchSummary({ queueFile });
    expect(summary.total).toBe(3);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.pending).toBe(1);
  });

  test('calculates success rate', () => {
    const filePath = path.join(TEST_DIR, 'batch.json');
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const requests = [
      { prompt: 'test 1' },
      { prompt: 'test 2' },
      { prompt: 'test 3' },
      { prompt: 'test 4' },
    ];
    fs.writeFileSync(filePath, JSON.stringify(requests));

    const batch = queueBatch(filePath, { isFile: true, queueFile });
    const { GenerationQueue } = require('../lib/queue');
    const queue = new GenerationQueue(queueFile);

    // Complete 3 out of 4
    queue.markCompleted(batch.requests[0].queueId, 'gen-1');
    queue.markCompleted(batch.requests[1].queueId, 'gen-2');
    queue.markCompleted(batch.requests[2].queueId, 'gen-3');
    queue.markFailed(batch.requests[3].queueId, 'Error', false);

    const summary = getBatchSummary({ queueFile });
    expect(summary.successRate).toBe('75.0%');
  });

  test('includes successful results', () => {
    const filePath = path.join(TEST_DIR, 'batch.json');
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const requests = [{ prompt: 'test 1' }];
    fs.writeFileSync(filePath, JSON.stringify(requests));

    const batch = queueBatch(filePath, { isFile: true, queueFile });
    const { GenerationQueue } = require('../lib/queue');
    const queue = new GenerationQueue(queueFile);

    queue.markCompleted(batch.requests[0].queueId, 'gen-123');

    const summary = getBatchSummary({ queueFile });
    expect(summary.results.successful.length).toBe(1);
    expect(summary.results.successful[0].generationId).toBe('gen-123');
  });

  test('includes failed results', () => {
    const filePath = path.join(TEST_DIR, 'batch.json');
    const queueFile = path.join(TEST_DIR, '.queue.json');
    const requests = [{ prompt: 'test 1' }];
    fs.writeFileSync(filePath, JSON.stringify(requests));

    const batch = queueBatch(filePath, { isFile: true, queueFile });
    const { GenerationQueue } = require('../lib/queue');
    const queue = new GenerationQueue(queueFile);

    queue.markFailed(batch.requests[0].queueId, 'Network error', false);

    const summary = getBatchSummary({ queueFile });
    expect(summary.results.failed.length).toBe(1);
    expect(summary.results.failed[0].error).toBe('Network error');
  });
});

describe('createExampleBatchFile', () => {
  test('creates example CSV file', () => {
    const filePath = path.join(TEST_DIR, 'example.csv');
    createExampleBatchFile(filePath, 'csv');

    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('prompt,style');
    expect(content).toContain('Lo-Fi Hip-Hop');
  });

  test('creates example JSON file', () => {
    const filePath = path.join(TEST_DIR, 'example.json');
    createExampleBatchFile(filePath, 'json');

    expect(fs.existsSync(filePath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBe(3);
    expect(content[0].prompt).toBeTruthy();
  });
});
