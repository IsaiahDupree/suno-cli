/**
 * Tests for comprehensive logging system
 */
const { Logger } = require('../lib/logger');

describe('Logger', () => {
  test('exports Logger class', () => {
    expect(Logger).toBeDefined();
  });

  test('instantiates with default level (info)', () => {
    const logger = new Logger();
    expect(logger).toBeDefined();
    expect(logger.level).toBe(1); // info level
  });

  test('respects SUNO_LOG_LEVEL environment variable', () => {
    process.env.SUNO_LOG_LEVEL = 'debug';
    const logger = new Logger();
    expect(logger.level).toBe(0); // debug level
    delete process.env.SUNO_LOG_LEVEL;
  });

  test('has debug, info, warn, error methods', () => {
    const logger = new Logger();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  test('logs with correct format', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const logger = new Logger({ level: 'info', useColor: false });

    logger.info('test message');
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0];
    expect(output).toMatch(/INFO.*test message/);

    spy.mockRestore();
  });

  test('respects log level filtering', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const logger = new Logger({ level: 'warn' });

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');

    expect(logSpy).not.toHaveBeenCalled();  // debug and info should not log
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('warn'));

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('handles object logging with JSON serialization', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const logger = new Logger({ useColor: false });

    const obj = { id: 'test-123', status: 'ok' };
    logger.info('event:', obj);

    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0];
    expect(output).toContain('test-123');
    expect(output).toContain('ok');

    spy.mockRestore();
  });

  test('log method is alias for info', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const logger = new Logger();

    logger.log('test');
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  test('handles errors with console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const logger = new Logger({ useColor: false });

    logger.error('error message');
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
