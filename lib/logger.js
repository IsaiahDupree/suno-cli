/**
 * Comprehensive logging system with configurable levels and optional file output.
 * Supports: debug, info, warn, error levels
 */
const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  constructor(options = {}) {
    this.level = LOG_LEVELS[process.env.SUNO_LOG_LEVEL || options.level || 'info'];
    this.logFile = process.env.SUNO_LOG_FILE || options.logFile;
    this.useColor = options.useColor !== false && process.stdout.isTTY;

    // Ensure log directory exists if logging to file
    if (this.logFile) {
      const dir = path.dirname(this.logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  _formatMessage(levelName, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    return { timestamp, levelName, message };
  }

  _colorize(levelName, text) {
    if (!this.useColor) return text;
    const colors = {
      debug: '\x1b[36m',    // cyan
      info: '\x1b[32m',     // green
      warn: '\x1b[33m',     // yellow
      error: '\x1b[31m',    // red
    };
    const reset = '\x1b[0m';
    return `${colors[levelName] || ''}${text}${reset}`;
  }

  _write(levelName, args) {
    const { timestamp, message } = this._formatMessage(levelName, args);
    const levelUpper = levelName.toUpperCase().padEnd(5);
    const logLine = `[${timestamp}] ${levelUpper} ${message}`;

    // Console output
    const colorized = this._colorize(levelName, logLine);
    if (levelName === 'error') {
      console.error(colorized);
    } else if (levelName === 'warn') {
      console.warn(colorized);
    } else {
      console.log(colorized);
    }

    // File output (if configured)
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, logLine + '\n', 'utf-8');
      } catch (err) {
        console.error(`Failed to write to log file: ${err.message}`);
      }
    }
  }

  debug(...args) {
    if (this.level <= LOG_LEVELS.debug) {
      this._write('debug', args);
    }
  }

  info(...args) {
    if (this.level <= LOG_LEVELS.info) {
      this._write('info', args);
    }
  }

  warn(...args) {
    if (this.level <= LOG_LEVELS.warn) {
      this._write('warn', args);
    }
  }

  error(...args) {
    if (this.level <= LOG_LEVELS.error) {
      this._write('error', args);
    }
  }

  // Alias for info
  log(...args) {
    this.info(...args);
  }
}

// Export singleton instance
const logger = new Logger();
module.exports = { Logger, logger };
