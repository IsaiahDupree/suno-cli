/**
 * Asynchronous generation queue for music requests
 */
const fs = require('fs');
const path = require('path');
const { DOWNLOAD_DIR } = require('./utils');

const QUEUE_FILE = path.join(DOWNLOAD_DIR, '.queue.json');

/**
 * Queue item structure
 * @typedef {object} QueueItem
 * @property {string} id - Unique queue item ID
 * @property {string} type - Request type: 'create', 'remix', 'extend', 'cover'
 * @property {object} params - Request parameters
 * @property {string} status - 'pending', 'processing', 'completed', 'failed'
 * @property {number} createdAt - Timestamp when queued
 * @property {number} startedAt - Timestamp when processing started
 * @property {number} completedAt - Timestamp when completed
 * @property {string} result - Result (generation ID, error message, etc.)
 * @property {number} retries - Number of retry attempts
 */

class GenerationQueue {
  constructor(queueFile = QUEUE_FILE) {
    this.queueFile = queueFile;
    this.queue = this.loadQueue();
  }

  /**
   * Load queue from file
   * @returns {QueueItem[]} Array of queue items
   */
  loadQueue() {
    if (!fs.existsSync(this.queueFile)) {
      return [];
    }

    try {
      const data = fs.readFileSync(this.queueFile, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.warn(`Warning: Could not load queue: ${err.message}`);
      return [];
    }
  }

  /**
   * Save queue to file
   */
  saveQueue() {
    try {
      const dir = path.dirname(this.queueFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.queueFile, JSON.stringify(this.queue, null, 2));
    } catch (err) {
      console.error(`Error saving queue: ${err.message}`);
    }
  }

  /**
   * Generate unique queue item ID
   * @returns {string} ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Add request to queue
   * @param {string} type - Request type
   * @param {object} params - Request parameters
   * @returns {string} Queue item ID
   */
  enqueue(type, params) {
    const item = {
      id: this.generateId(),
      type,
      params,
      status: 'pending',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      retries: 0,
    };

    this.queue.push(item);
    this.saveQueue();
    return item.id;
  }

  /**
   * Get next pending item to process
   * @returns {QueueItem|null} Next pending item or null
   */
  getNext() {
    return this.queue.find(item => item.status === 'pending') || null;
  }

  /**
   * Mark item as processing
   * @param {string} itemId - Queue item ID
   */
  markProcessing(itemId) {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.status = 'processing';
      item.startedAt = Date.now();
      this.saveQueue();
    }
  }

  /**
   * Mark item as completed
   * @param {string} itemId - Queue item ID
   * @param {string} result - Result (generation ID)
   */
  markCompleted(itemId, result) {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.status = 'completed';
      item.completedAt = Date.now();
      item.result = result;
      this.saveQueue();
    }
  }

  /**
   * Mark item as failed
   * @param {string} itemId - Queue item ID
   * @param {string} reason - Error reason
   * @param {boolean} retryable - Whether item should be retried
   */
  markFailed(itemId, reason, retryable = true) {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      if (retryable && item.retries < 3) {
        item.status = 'pending';
        item.retries++;
        console.log(`Retrying item ${itemId} (attempt ${item.retries})`);
      } else {
        item.status = 'failed';
        item.completedAt = Date.now();
        item.result = reason;
      }
      this.saveQueue();
    }
  }

  /**
   * Get queue status
   * @returns {object} Queue statistics
   */
  getStatus() {
    const pending = this.queue.filter(i => i.status === 'pending').length;
    const processing = this.queue.filter(i => i.status === 'processing').length;
    const completed = this.queue.filter(i => i.status === 'completed').length;
    const failed = this.queue.filter(i => i.status === 'failed').length;

    return {
      total: this.queue.length,
      pending,
      processing,
      completed,
      failed,
    };
  }

  /**
   * List queue items
   * @param {object} options - { status, type, limit }
   * @returns {QueueItem[]} Filtered queue items
   */
  list(options = {}) {
    const { status = null, type = null, limit = null } = options;

    let items = this.queue;

    if (status) items = items.filter(i => i.status === status);
    if (type) items = items.filter(i => i.type === type);
    if (limit) items = items.slice(0, limit);

    return items;
  }

  /**
   * Clear completed items from queue
   * @returns {number} Number of items removed
   */
  clearCompleted() {
    const before = this.queue.length;
    this.queue = this.queue.filter(i => i.status !== 'completed' && i.status !== 'failed');
    this.saveQueue();
    return before - this.queue.length;
  }

  /**
   * Reset entire queue
   */
  reset() {
    this.queue = [];
    this.saveQueue();
  }

  /**
   * Get item by ID
   * @param {string} itemId - Queue item ID
   * @returns {QueueItem|null} Queue item or null
   */
  getItem(itemId) {
    return this.queue.find(i => i.id === itemId) || null;
  }

  /**
   * Remove item from queue
   * @param {string} itemId - Queue item ID
   * @returns {boolean} True if removed
   */
  remove(itemId) {
    const index = this.queue.findIndex(i => i.id === itemId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveQueue();
      return true;
    }
    return false;
  }
}

module.exports = { GenerationQueue, QUEUE_FILE };
