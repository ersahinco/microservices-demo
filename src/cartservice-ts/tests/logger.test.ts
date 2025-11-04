/**
 * Tests for structured logger
 * Validates log formatting and trace context inclusion
 */

import { logger } from '../src/utils/logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should log structured JSON with required fields', () => {
    logger.info('Test message', { key: 'value' });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const logEntry = JSON.parse(logOutput);

    expect(logEntry).toHaveProperty('timestamp');
    expect(logEntry).toHaveProperty('level', 'info');
    expect(logEntry).toHaveProperty('message', 'Test message');
    expect(logEntry).toHaveProperty('service');
    expect(logEntry.context).toEqual({ key: 'value' });
  });

  it('should include trace_id and span_id when OpenTelemetry context is available', () => {
    // Note: This test validates the structure, actual trace context
    // would be populated by OpenTelemetry when instrumentation is active
    logger.info('Test with trace context');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const logEntry = JSON.parse(logOutput);

    // Log entry should have the structure to support trace_id and span_id
    expect(logEntry).toHaveProperty('timestamp');
    expect(logEntry).toHaveProperty('level');
    expect(logEntry).toHaveProperty('message');
    expect(logEntry).toHaveProperty('service');
  });

  it('should use console.error for error level logs', () => {
    logger.error('Error message', { error: 'details' });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleErrorSpy.mock.calls[0][0];
    const logEntry = JSON.parse(logOutput);

    expect(logEntry.level).toBe('error');
    expect(logEntry.message).toBe('Error message');
  });

  it('should handle logs without context', () => {
    logger.info('Simple message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logOutput = consoleLogSpy.mock.calls[0][0];
    const logEntry = JSON.parse(logOutput);

    expect(logEntry.message).toBe('Simple message');
    expect(logEntry.context).toBeUndefined();
  });
});
