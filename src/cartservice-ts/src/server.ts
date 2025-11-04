/**
 * gRPC server setup and configuration
 * Loads proto definitions, registers services, and manages server lifecycle
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { ICartStore } from './storage/cart-store';
import { createCartHandlers } from './handlers/cart-handler';
import { createHealthHandlers } from './handlers/health-handler';
import { logger } from './utils/logger';
import { config } from './utils/config';

/**
 * gRPC server instance
 */
export class CartServer {
  private server: grpc.Server;
  private store: ICartStore;
  private protoDescriptor: any;

  constructor(store: ICartStore) {
    this.store = store;
    this.server = new grpc.Server({
      'grpc.max_send_message_length': 4 * 1024 * 1024, // 4MB
      'grpc.max_receive_message_length': 4 * 1024 * 1024, // 4MB
      'grpc.keepalive_time_ms': 120000, // 2 minutes
      'grpc.keepalive_timeout_ms': 20000, // 20 seconds
      'grpc.keepalive_permit_without_calls': 1,
      'grpc.http2.min_time_between_pings_ms': 120000,
      'grpc.http2.max_pings_without_data': 0,
    });

    this.loadProtoDefinitions();
    this.registerServices();
  }

  /**
   * Load protobuf definitions for CartService and HealthService
   */
  private loadProtoDefinitions(): void {
    // Load CartService proto
    const CART_PROTO_PATH = path.join(__dirname, '../proto/demo.proto');
    const cartPackageDefinition = protoLoader.loadSync(CART_PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    // Load HealthService proto
    const HEALTH_PROTO_PATH = path.join(__dirname, '../proto/grpc/health/v1/health.proto');
    const healthPackageDefinition = protoLoader.loadSync(HEALTH_PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const cartProto = grpc.loadPackageDefinition(cartPackageDefinition);
    const healthProto = grpc.loadPackageDefinition(healthPackageDefinition);

    this.protoDescriptor = {
      cart: cartProto,
      health: healthProto,
    };

    logger.debug('Proto definitions loaded', {
      cartProto: CART_PROTO_PATH,
      healthProto: HEALTH_PROTO_PATH,
    });
  }

  /**
   * Register CartService and HealthService with their implementations
   */
  private registerServices(): void {
    // Register CartService
    const cartHandlers = createCartHandlers(this.store);
    this.server.addService(
      (this.protoDescriptor.cart.hipstershop as any).CartService.service,
      cartHandlers
    );
    logger.debug('CartService registered');

    // Register HealthService
    const healthHandlers = createHealthHandlers(this.store);
    this.server.addService(
      (this.protoDescriptor.health.grpc.health.v1 as any).Health.service,
      healthHandlers
    );
    logger.debug('HealthService registered');
  }

  /**
   * Start the gRPC server and bind to the configured port
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const address = `0.0.0.0:${config.port}`;
      
      this.server.bindAsync(
        address,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            logger.error('Failed to bind server', { error: error.message, address });
            reject(error);
            return;
          }

          this.server.start();
          logger.info('gRPC server started', { address, port });
          resolve();
        }
      );
    });
  }

  /**
   * Gracefully shutdown the gRPC server
   * Waits for existing requests to complete before shutting down
   */
  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      logger.info('Shutting down gRPC server...');
      
      this.server.tryShutdown((error) => {
        if (error) {
          logger.warn('Error during graceful shutdown, forcing shutdown', {
            error: error.message,
          });
          this.server.forceShutdown();
        } else {
          logger.info('gRPC server shut down gracefully');
        }
        resolve();
      });
    });
  }

  /**
   * Force shutdown the gRPC server immediately
   */
  forceShutdown(): void {
    logger.warn('Force shutting down gRPC server');
    this.server.forceShutdown();
  }
}
