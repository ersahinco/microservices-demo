/**
 * gRPC handlers for CartService operations
 * Implements AddItem, GetCart, and EmptyCart methods
 */

import * as grpc from '@grpc/grpc-js';
import { ICartStore, Cart } from '../storage/cart-store';
import { logger } from '../utils/logger';
import { recordCartRequest } from '../telemetry/metrics';

/**
 * gRPC request/response types based on proto definitions
 */
export interface AddItemRequest {
  user_id: string;
  item: {
    product_id: string;
    quantity: number;
  };
}

export interface GetCartRequest {
  user_id: string;
}

export interface EmptyCartRequest {
  user_id: string;
}

export interface Empty {}

/**
 * Create CartService gRPC handlers
 */
export function createCartHandlers(store: ICartStore) {
  return {
    /**
     * Add an item to a user's cart
     */
    async addItem(
      call: grpc.ServerUnaryCall<AddItemRequest, Empty>,
      callback: grpc.sendUnaryData<Empty>
    ): Promise<void> {
      const startTime = Date.now();
      const request = call.request;
      
      try {
        // Validate input
        if (!request.user_id || request.user_id.trim() === '') {
          logger.warn('AddItem called with missing user_id', { request });
          const duration = (Date.now() - startTime) / 1000;
          recordCartRequest('AddItem', 'INVALID_ARGUMENT', duration);
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'user_id is required',
          });
          return;
        }

        if (!request.item) {
          logger.warn('AddItem called with missing item', { userId: request.user_id });
          const duration = (Date.now() - startTime) / 1000;
          recordCartRequest('AddItem', 'INVALID_ARGUMENT', duration);
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'item is required',
          });
          return;
        }

        if (!request.item.product_id || request.item.product_id.trim() === '') {
          logger.warn('AddItem called with missing product_id', { 
            userId: request.user_id 
          });
          const duration = (Date.now() - startTime) / 1000;
          recordCartRequest('AddItem', 'INVALID_ARGUMENT', duration);
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'product_id is required',
          });
          return;
        }

        if (!request.item.quantity || request.item.quantity <= 0) {
          logger.warn('AddItem called with invalid quantity', { 
            userId: request.user_id,
            productId: request.item.product_id,
            quantity: request.item.quantity
          });
          const duration = (Date.now() - startTime) / 1000;
          recordCartRequest('AddItem', 'INVALID_ARGUMENT', duration);
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'quantity must be greater than 0',
          });
          return;
        }

        // Call storage layer
        await store.addItem(
          request.user_id,
          request.item.product_id,
          request.item.quantity
        );

        logger.info('Item added to cart', {
          userId: request.user_id,
          productId: request.item.product_id,
          quantity: request.item.quantity,
        });

        const duration = (Date.now() - startTime) / 1000;
        recordCartRequest('AddItem', 'OK', duration);
        callback(null, {});
      } catch (error) {
        logger.error('Failed to add item to cart', {
          userId: request.user_id,
          productId: request.item?.product_id,
          error: error instanceof Error ? error.message : String(error),
        });

        const duration = (Date.now() - startTime) / 1000;
        recordCartRequest('AddItem', 'FAILED_PRECONDITION', duration);
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `Can't access cart storage: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },

    /**
     * Get a user's complete shopping cart
     */
    async getCart(
      call: grpc.ServerUnaryCall<GetCartRequest, Cart>,
      callback: grpc.sendUnaryData<Cart>
    ): Promise<void> {
      const startTime = Date.now();
      const request = call.request;

      try {
        // Validate input
        if (!request.user_id || request.user_id.trim() === '') {
          logger.warn('GetCart called with missing user_id', { request });
          const duration = (Date.now() - startTime) / 1000;
          recordCartRequest('GetCart', 'INVALID_ARGUMENT', duration);
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'user_id is required',
          });
          return;
        }

        // Call storage layer
        const cart = await store.getCart(request.user_id);

        logger.info('Cart retrieved', {
          userId: request.user_id,
          itemCount: cart.items.length,
        });

        // Convert to gRPC response format (snake_case for proto)
        const response: any = {
          user_id: cart.userId,
          items: cart.items.map(item => ({
            product_id: item.productId,
            quantity: item.quantity,
          })),
        };

        logger.debug('Sending cart response', {
          userId: cart.userId,
          itemCount: cart.items.length,
          items: response.items,
        });

        const duration = (Date.now() - startTime) / 1000;
        recordCartRequest('GetCart', 'OK', duration);
        callback(null, response);
      } catch (error) {
        logger.error('Failed to get cart', {
          userId: request.user_id,
          error: error instanceof Error ? error.message : String(error),
        });

        const duration = (Date.now() - startTime) / 1000;
        recordCartRequest('GetCart', 'FAILED_PRECONDITION', duration);
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `Can't access cart storage: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },

    /**
     * Empty a user's shopping cart
     */
    async emptyCart(
      call: grpc.ServerUnaryCall<EmptyCartRequest, Empty>,
      callback: grpc.sendUnaryData<Empty>
    ): Promise<void> {
      const startTime = Date.now();
      const request = call.request;

      try {
        // Validate input
        if (!request.user_id || request.user_id.trim() === '') {
          logger.warn('EmptyCart called with missing user_id', { request });
          const duration = (Date.now() - startTime) / 1000;
          recordCartRequest('EmptyCart', 'INVALID_ARGUMENT', duration);
          callback({
            code: grpc.status.INVALID_ARGUMENT,
            message: 'user_id is required',
          });
          return;
        }

        // Call storage layer
        await store.emptyCart(request.user_id);

        logger.info('Cart emptied', {
          userId: request.user_id,
        });

        const duration = (Date.now() - startTime) / 1000;
        recordCartRequest('EmptyCart', 'OK', duration);
        callback(null, {});
      } catch (error) {
        logger.error('Failed to empty cart', {
          userId: request.user_id,
          error: error instanceof Error ? error.message : String(error),
        });

        const duration = (Date.now() - startTime) / 1000;
        recordCartRequest('EmptyCart', 'FAILED_PRECONDITION', duration);
        callback({
          code: grpc.status.FAILED_PRECONDITION,
          message: `Can't access cart storage: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  };
}
