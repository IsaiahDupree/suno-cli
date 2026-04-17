const fs = require('fs');
const path = require('path');
const { GenerationQueue } = require('../lib/queue');

const TEST_DIR = path.join(__dirname, 'tmp-queue');
const TEST_QUEUE_FILE = path.join(TEST_DIR, '.queue.json');

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.readdirSync(TEST_DIR).forEach(f => fs.unlinkSync(path.join(TEST_DIR, f)));
    fs.rmdirSync(TEST_DIR);
  }
});

describe('GenerationQueue', () => {
  test('creates new queue', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    expect(q.queue).toEqual([]);
  });

  test('loads existing queue from file', () => {
    const items = [
      { id: '1', type: 'create', status: 'completed', result: 'gen-123' },
    ];
    fs.writeFileSync(TEST_QUEUE_FILE, JSON.stringify(items));

    const q = new GenerationQueue(TEST_QUEUE_FILE);
    expect(q.queue).toEqual(items);
  });

  test('handles missing queue file', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    expect(q.queue).toEqual([]);
  });
});

describe('enqueue', () => {
  test('adds request to queue', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'jazz music' });

    expect(id).toBeTruthy();
    expect(q.queue.length).toBe(1);
    expect(q.queue[0].type).toBe('create');
    expect(q.queue[0].params.prompt).toBe('jazz music');
    expect(q.queue[0].status).toBe('pending');
  });

  test('persists queue to file', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    q.enqueue('create', { prompt: 'test' });

    expect(fs.existsSync(TEST_QUEUE_FILE)).toBe(true);
    const data = JSON.parse(fs.readFileSync(TEST_QUEUE_FILE, 'utf8'));
    expect(data.length).toBe(1);
  });

  test('generates unique IDs', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id1 = q.enqueue('create', { prompt: 'test1' });
    const id2 = q.enqueue('create', { prompt: 'test2' });

    expect(id1).not.toBe(id2);
  });

  test('supports different request types', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    q.enqueue('create', { prompt: 'test' });
    q.enqueue('remix', { clipId: '123' });
    q.enqueue('extend', { clipId: '123' });
    q.enqueue('cover', { clipId: '123' });

    expect(q.queue[0].type).toBe('create');
    expect(q.queue[1].type).toBe('remix');
    expect(q.queue[2].type).toBe('extend');
    expect(q.queue[3].type).toBe('cover');
  });
});

describe('getNext', () => {
  test('returns next pending item', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });

    const next = q.getNext();
    expect(next).toBeTruthy();
    expect(next.id).toBe(id);
    expect(next.status).toBe('pending');
  });

  test('returns null when no pending items', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });
    q.markCompleted(id, 'gen-123');

    const next = q.getNext();
    expect(next).toBeNull();
  });

  test('skips processing items', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id1 = q.enqueue('create', { prompt: 'test1' });
    const id2 = q.enqueue('create', { prompt: 'test2' });

    q.markProcessing(id1);
    const next = q.getNext();
    expect(next.id).toBe(id2);
  });
});

describe('markProcessing', () => {
  test('updates item status to processing', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });

    q.markProcessing(id);
    const item = q.getItem(id);
    expect(item.status).toBe('processing');
  });

  test('sets startedAt timestamp', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });
    const before = Date.now();

    q.markProcessing(id);
    const item = q.getItem(id);
    expect(item.startedAt).toBeGreaterThanOrEqual(before);
    expect(item.startedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('markCompleted', () => {
  test('updates item status to completed', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });

    q.markCompleted(id, 'gen-123');
    const item = q.getItem(id);
    expect(item.status).toBe('completed');
    expect(item.result).toBe('gen-123');
  });

  test('sets completedAt timestamp', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });
    const before = Date.now();

    q.markCompleted(id, 'gen-123');
    const item = q.getItem(id);
    expect(item.completedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('markFailed', () => {
  test('marks item as failed', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });

    q.markFailed(id, 'Network error', false);
    const item = q.getItem(id);
    expect(item.status).toBe('failed');
    expect(item.result).toBe('Network error');
  });

  test('retries failed items up to 3 times', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });

    for (let i = 0; i < 3; i++) {
      q.markFailed(id, 'Error', true);
      const item = q.getItem(id);
      if (i < 2) {
        expect(item.status).toBe('pending');
        expect(item.retries).toBe(i + 1);
      }
    }

    // After 3 retries, should be marked failed
    q.markFailed(id, 'Final error', true);
    const item = q.getItem(id);
    expect(item.status).toBe('failed');
  });

  test('does not retry non-retryable errors', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });

    q.markFailed(id, 'Invalid parameters', false);
    const item = q.getItem(id);
    expect(item.status).toBe('failed');
    expect(item.retries).toBe(0);
  });
});

describe('getStatus', () => {
  test('returns queue statistics', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    q.enqueue('create', { prompt: 'test1' });
    q.enqueue('create', { prompt: 'test2' });

    const status = q.getStatus();
    expect(status.total).toBe(2);
    expect(status.pending).toBe(2);
    expect(status.processing).toBe(0);
    expect(status.completed).toBe(0);
    expect(status.failed).toBe(0);
  });

  test('counts items by status', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id1 = q.enqueue('create', { prompt: 'test1' });
    const id2 = q.enqueue('create', { prompt: 'test2' });
    const id3 = q.enqueue('create', { prompt: 'test3' });

    q.markProcessing(id1);
    q.markCompleted(id2, 'gen-123');
    q.markFailed(id3, 'Error', false);

    const status = q.getStatus();
    expect(status.pending).toBe(0);
    expect(status.processing).toBe(1);
    expect(status.completed).toBe(1);
    expect(status.failed).toBe(1);
  });
});

describe('list', () => {
  test('returns all items by default', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    q.enqueue('create', { prompt: 'test1' });
    q.enqueue('create', { prompt: 'test2' });

    const items = q.list();
    expect(items.length).toBe(2);
  });

  test('filters by status', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id1 = q.enqueue('create', { prompt: 'test1' });
    const id2 = q.enqueue('create', { prompt: 'test2' });

    q.markCompleted(id1, 'gen-123');

    const completed = q.list({ status: 'completed' });
    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe(id1);
  });

  test('filters by type', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    q.enqueue('create', { prompt: 'test1' });
    q.enqueue('remix', { clipId: '123' });

    const creates = q.list({ type: 'create' });
    expect(creates.length).toBe(1);
    expect(creates[0].type).toBe('create');
  });

  test('applies limit', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    q.enqueue('create', { prompt: 'test1' });
    q.enqueue('create', { prompt: 'test2' });
    q.enqueue('create', { prompt: 'test3' });

    const items = q.list({ limit: 2 });
    expect(items.length).toBe(2);
  });
});

describe('clearCompleted', () => {
  test('removes completed items', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id1 = q.enqueue('create', { prompt: 'test1' });
    const id2 = q.enqueue('create', { prompt: 'test2' });

    q.markCompleted(id1, 'gen-123');
    const removed = q.clearCompleted();

    expect(removed).toBe(1);
    expect(q.queue.length).toBe(1);
  });

  test('removes failed items', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id1 = q.enqueue('create', { prompt: 'test1' });
    const id2 = q.enqueue('create', { prompt: 'test2' });

    q.markFailed(id1, 'Error', false);
    const removed = q.clearCompleted();

    expect(removed).toBe(1);
    expect(q.queue.length).toBe(1);
  });
});

describe('remove', () => {
  test('removes item by ID', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const id = q.enqueue('create', { prompt: 'test' });

    const removed = q.remove(id);
    expect(removed).toBe(true);
    expect(q.queue.length).toBe(0);
  });

  test('returns false for non-existent item', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    const removed = q.remove('nonexistent');
    expect(removed).toBe(false);
  });
});

describe('reset', () => {
  test('clears entire queue', () => {
    const q = new GenerationQueue(TEST_QUEUE_FILE);
    q.enqueue('create', { prompt: 'test1' });
    q.enqueue('create', { prompt: 'test2' });

    q.reset();
    expect(q.queue.length).toBe(0);
    expect(fs.existsSync(TEST_QUEUE_FILE)).toBe(true);
  });
});
