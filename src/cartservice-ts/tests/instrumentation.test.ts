/**
 * Tests for OpenTelemetry instrumentation
 * Validates that telemetry is properly configured
 */

import { initializeTelemetry, shutdownTelemetry } from '../src/telemetry/instrumentation';

describe('OpenTelemetry Instrumentation', () => {
  afterEach(async () => {
    await shutdownTelemetry();
  });

  it('should initialize without crashing when OTEL endpoint is not configured', () => {
    // Remove OTEL endpoint to test default behavior
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    
    expect(() => {
      initializeTelemetry();
    }).not.toThrow();
  });

  it('should initialize with mock OTEL endpoint', () => {
    // Set mock endpoint
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';
    process.env.OTEL_SERVICE_NAME = 'cartservice-ts-test';
    
    expect(() => {
      initializeTelemetry();
    }).not.toThrow();
  });

  it('should handle initialization errors gracefully', () => {
    // Set invalid endpoint to trigger potential errors
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'invalid://endpoint';
    
    // Should not throw even with invalid endpoint
    expect(() => {
      initializeTelemetry();
    }).not.toThrow();
  });
});
