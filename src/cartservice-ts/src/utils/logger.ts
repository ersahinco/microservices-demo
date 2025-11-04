/**
 * Structured logging utility for Cart Service
 * Provides JSON-formatted logs for Grafana observability stack
 * Uses OpenTelemetry LoggerProvider to send logs via OTLP
 */

import { config } from './config';
import { trace, context as otelContext } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  context?: Record<string, any>;
  trace_id?: string;
  span_id?: string;
}

/**
 * Log level priority mapping
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Map log level to OpenTelemetry SeverityNumber
 */
const SEVERITY_MAP: Record<LogLevel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

/**
 * Get current log level priority from config
 */
function getCurrentLogLevelPriority(): number {
  return LOG_LEVEL_PRIORITY[config.logLevel as LogLevel] ?? LOG_LEVEL_PRIORITY.info;
}

/**
 * Check if a log level should be logged based on configured level
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= getCurrentLogLevelPriority();
}

/**
 * Get OpenTelemetry logger instance (lazy initialization)
 */
let otelLogger: any = null;
function getOtelLogger() {
  if (!otelLogger) {
    try {
      const loggerProvider = logs.getLoggerProvider();
      otelLogger = loggerProvider.getLogger(config.serviceName, config.serviceVersion);
    } catch (error) {
      // LoggerProvider not available yet
      otelLogger = null;
    }
  }
  return otelLogger;
}

/**
 * Format and output a log entry
 */
function log(level: LogLevel, message: string, context?: Record<string, any>): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: config.serviceName,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  // Include trace context (trace_id and span_id) if available from OpenTelemetry
  try {
    const span = trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      entry.trace_id = spanContext.traceId;
      entry.span_id = spanContext.spanId;
    }
  } catch (error) {
    // OpenTelemetry not available or not initialized yet
  }

  // Send log via OpenTelemetry LoggerProvider if available
  const logger = getOtelLogger();
  if (logger) {
    try {
      logger.emit({
        severityNumber: SEVERITY_MAP[level],
        severityText: level.toUpperCase(),
        body: message,
        attributes: {
          'service.name': config.serviceName,
          'service.version': config.serviceVersion,
          ...(context || {}),
        },
        context: otelContext.active(),
      });
    } catch (error) {
      // Failed to emit via OTLP, fall back to console
    }
  }

  // Also output to console for local debugging and container logs
  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
}

/**
 * Logger instance with level-specific methods
 */
export const logger = {
  debug(message: string, context?: Record<string, any>): void {
    log('debug', message, context);
  },

  info(message: string, context?: Record<string, any>): void {
    log('info', message, context);
  },

  warn(message: string, context?: Record<string, any>): void {
    log('warn', message, context);
  },

  error(message: string, context?: Record<string, any>): void {
    log('error', message, context);
  },
};
