/**
 * Application entry point for Cart Service
 * Initializes telemetry, storage, and gRPC server
 */

import { shutdownTelemetry } from './telemetry/instrumentation';
import { config } from './utils/config';
import { logger } from './utils/logger';
import { ICartStore } from './storage/cart-store';
import { RedisStore } from './storage/redis-store';
import { MemoryStore } from './storage/memory-store';
import { CartServer } from './server';

/**
 * Initialize storage backend based on configuration
 * Uses Redis if REDIS_ADDR is configured, otherwise falls back to in-memory storage
 */
function initializeStorage(): ICartStore {
  if (config.redisAddr) {
    logger.info('Initializing Redis storage', { redisAddr: config.redisAddr });
    return new RedisStore(config.redisAddr);
  } else {
    logger.info('Initializing in-memory storage (Redis not configured)');
    return new MemoryStore();
  }
}

/**
 * Main application startup
 */
async function main(): Promise<void> {
  try {
    // Log startup information
    logger.info('Starting Cart Service', {
      serviceName: config.serviceName,
      version: config.serviceVersion,
      port: config.port,
      logLevel: config.logLevel,
      redisAddr: config.redisAddr || 'not configured (using memory store)',
      otelEndpoint: config.otelExporterEndpoint || 'not configured',
    });

    // OpenTelemetry instrumentation is auto-initialized via --require flag in Dockerfile

    // Initialize storage backend
    const store = initializeStorage();

    // Create and start gRPC server
    const server = new CartServer(store);
    await server.start();

    logger.info('Cart Service is ready to accept requests');

    // Setup graceful shutdown handlers
    setupShutdownHandlers(server, store);
  } catch (error) {
    logger.error('Failed to start Cart Service', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

/**
 * Setup handlers for graceful shutdown on process signals
 */
function setupShutdownHandlers(server: CartServer, store: ICartStore): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring signal', { signal });
      return;
    }

    isShuttingDown = true;
    logger.info('Received shutdown signal', { signal });

    try {
      // Shutdown gRPC server (wait for existing requests to complete)
      await server.shutdown();

      // Close storage connections
      if (store instanceof RedisStore) {
        await store.close();
      }

      // Shutdown OpenTelemetry (flush pending telemetry)
      await shutdownTelemetry();

      logger.info('Cart Service shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  // Handle SIGTERM (Kubernetes sends this for graceful shutdown)
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle SIGINT (Ctrl+C in terminal)
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    server.forceShutdown();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    server.forceShutdown();
    process.exit(1);
  });
}

// Start the application
main();
