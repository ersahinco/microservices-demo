/**
 * Custom metrics for cart operations
 * Provides counters and histograms for monitoring cart service performance
 */

import { metrics } from '@opentelemetry/api';
import { Counter, Histogram } from '@opentelemetry/api';

// Get meter for cart service
const meter = metrics.getMeter('cartservice-ts');

/**
 * Counter for total cart requests by method and status
 */
export const cartRequestsTotal: Counter = meter.createCounter('cart_requests_total', {
  description: 'Total number of cart requests by method and status',
  unit: '1',
});

/**
 * Histogram for cart request duration in seconds
 */
export const cartRequestDuration: Histogram = meter.createHistogram('cart_request_duration_seconds', {
  description: 'Duration of cart requests in seconds',
  unit: 's',
});

/**
 * Counter for storage operations
 */
export const cartStorageOperationsTotal: Counter = meter.createCounter('cart_storage_operations_total', {
  description: 'Total number of cart storage operations',
  unit: '1',
});

/**
 * Histogram for storage operation duration in seconds
 */
export const cartStorageDuration: Histogram = meter.createHistogram('cart_storage_duration_seconds', {
  description: 'Duration of cart storage operations in seconds',
  unit: 's',
});

/**
 * Record a cart request with method and status
 */
export function recordCartRequest(method: string, status: string, durationSeconds: number): void {
  cartRequestsTotal.add(1, { method, status });
  cartRequestDuration.record(durationSeconds, { method, status });
}

/**
 * Record a storage operation with operation type and status
 */
export function recordStorageOperation(operation: string, status: string, durationSeconds: number): void {
  cartStorageOperationsTotal.add(1, { operation, status });
  cartStorageDuration.record(durationSeconds, { operation, status });
}
