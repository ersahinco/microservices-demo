/**
 * gRPC health check handler
 * Implements the standard gRPC health check protocol
 */

import * as grpc from '@grpc/grpc-js';
import { ICartStore } from '../storage/cart-store';
import { logger } from '../utils/logger';

/**
 * gRPC health check request/response types
 */
export interface HealthCheckRequest {
  service: string;
}

export interface HealthCheckResponse {
  status: ServingStatus;
}

export enum ServingStatus {
  UNKNOWN = 0,
  SERVING = 1,
  NOT_SERVING = 2,
}

/**
 * Create Health service gRPC handlers
 */
export function createHealthHandlers(store: ICartStore) {
  return {
    /**
     * Check service health status
     * Returns SERVING if the service is operational and storage is accessible
     */
    async check(
      call: grpc.ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>,
      callback: grpc.sendUnaryData<HealthCheckResponse>
    ): Promise<void> {
      try {
        logger.debug('Health check requested', {
          service: call.request.service,
        });

        // Check storage backend connectivity
        const isStorageHealthy = await store.ping();

        if (isStorageHealthy) {
          logger.debug('Health check passed');
          callback(null, { status: ServingStatus.SERVING });
        } else {
          logger.warn('Health check failed: storage not accessible');
          callback(null, { status: ServingStatus.NOT_SERVING });
        }
      } catch (error) {
        logger.error('Health check error', {
          error: error instanceof Error ? error.message : String(error),
        });
        
        // Return NOT_SERVING if health check fails
        callback(null, { status: ServingStatus.NOT_SERVING });
      }
    },
  };
}
