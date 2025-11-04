/**
 * OpenTelemetry instrumentation setup for Grafana observability stack
 * Configures tracing, metrics, and logs collection for the Cart Service
 * 
 * Based on grafana/docker-otel-lgtm best practices:
 * https://github.com/grafana/docker-otel-lgtm
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { logs } from '@opentelemetry/api-logs';
import { config } from '../utils/config';

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry instrumentation
 * Sets up tracing, metrics, and logs with OTLP exporters for Grafana LGTM stack
 */
export function initializeTelemetry(): void {
  try {
    // Create resource with service information using latest semantic conventions
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
    });

    // Configure trace exporter
    const traceExporter = config.otelExporterEndpoint
      ? new OTLPTraceExporter({
        url: config.otelExporterEndpoint,
      })
      : undefined; // Use console exporter by default if no endpoint configured

    // Configure metric exporter
    const metricExporter = config.otelExporterEndpoint
      ? new OTLPMetricExporter({
        url: config.otelExporterEndpoint,
      })
      : undefined;

    // Create metric reader
    const metricReader = metricExporter
      ? new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 10000, // Export every 10 seconds
      })
      : undefined;

    // Configure log exporter and logger provider
    let loggerProvider: LoggerProvider | undefined;
    if (config.otelExporterEndpoint) {
      const logExporter = new OTLPLogExporter({
        url: config.otelExporterEndpoint,
      });

      loggerProvider = new LoggerProvider({ resource });
      loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));

      // Set as global logger provider
      logs.setGlobalLoggerProvider(loggerProvider);
    }

    // Initialize NodeSDK with gRPC instrumentation
    sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader,
      instrumentations: [
        new GrpcInstrumentation(),
      ],
    });

    // Start the SDK
    sdk.start();

    // Use console.log here since logger might not be fully initialized yet
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'OpenTelemetry instrumentation initialized',
      service: config.serviceName,
      context: {
        serviceName: config.serviceName,
        serviceVersion: config.serviceVersion,
        otelEndpoint: config.otelExporterEndpoint || 'not configured',
      }
    }));
  } catch (error) {
    // Use console.error here since logger might not be fully initialized yet
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Failed to initialize OpenTelemetry',
      service: config.serviceName,
      context: {
        error: error instanceof Error ? error.message : String(error),
      }
    }));
    // Don't throw - allow service to start even if telemetry fails
  }
}

/**
 * Gracefully shutdown OpenTelemetry SDK
 * Ensures all pending telemetry data is exported before shutdown
 */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'OpenTelemetry instrumentation shut down',
        service: config.serviceName,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Error shutting down OpenTelemetry',
        service: config.serviceName,
        context: {
          error: error instanceof Error ? error.message : String(error),
        }
      }));
    }
  }
}

// Auto-initialize when module is loaded (for --require flag)
initializeTelemetry();
