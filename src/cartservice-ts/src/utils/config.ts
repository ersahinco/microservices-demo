/**
 * Configuration management for Cart Service
 * Loads configuration from environment variables with sensible defaults
 */

export interface Config {
  port: number;
  redisAddr: string | null;
  logLevel: string;
  serviceName: string;
  serviceVersion: string;
  otelExporterEndpoint: string | null;
}

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): Config {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 7070;
  const redisAddr = process.env.REDIS_ADDR || null;
  const logLevel = process.env.LOG_LEVEL || 'info';
  const serviceName = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'cartservice-ts';
  const serviceVersion = process.env.OTEL_SERVICE_VERSION || '1.0.0';
  const otelExporterEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null;

  // Validate port
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}. Must be between 1 and 65535.`);
  }

  // Validate log level
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(logLevel.toLowerCase())) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
  }

  return {
    port,
    redisAddr,
    logLevel: logLevel.toLowerCase(),
    serviceName,
    serviceVersion,
    otelExporterEndpoint,
  };
}

/**
 * Singleton config instance
 */
export const config: Config = loadConfig();
