/**
 * Redis implementation of cart storage.
 * Uses Protobuf serialization for compatibility with the .NET version.
 */

import Redis from 'ioredis';
import * as protobuf from 'protobufjs';
import { ICartStore, Cart } from './cart-store';
import { logger } from '../utils/logger';
import { recordStorageOperation } from '../telemetry/metrics';
import * as path from 'path';

/**
 * Redis cart store with Protobuf serialization.
 */
export class RedisStore implements ICartStore {
    private client: Redis;
    private CartMessage!: protobuf.Type;

    constructor(redisAddr: string) {
        // Parse Redis address (format: host:port)
        const [host, portStr] = redisAddr.split(':');
        const port = parseInt(portStr, 10) || 6379;

        this.client = new Redis({
            host,
            port,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                logger.warn('Redis connection retry', { attempt: times, delayMs: delay });
                return delay;
            },
            maxRetriesPerRequest: 3,
        });

        this.client.on('error', (err) => {
            logger.error('Redis connection error', { error: err.message });
        });

        this.client.on('connect', () => {
            logger.info('Redis connected', { host, port });
        });

        // Load proto definitions for serialization
        this.loadProtoDefinitions();
    }

    /**
     * Load protobuf definitions for Cart serialization.
     */
    private loadProtoDefinitions(): void {
        const PROTO_PATH = path.join(__dirname, '../../proto/demo.proto');

        const root = protobuf.loadSync(PROTO_PATH);
        this.CartMessage = root.lookupType('hipstershop.Cart');

        logger.debug('Proto definitions loaded for Redis serialization');
    }

    /**
     * Serialize a Cart object to Protobuf binary format.
     */
    private serializeCart(cart: Cart): Buffer {
        // protobufjs expects camelCase for JavaScript objects
        // It will automatically convert to snake_case in the protobuf binary
        const protoCart = {
            userId: cart.userId,
            items: cart.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
            })),
        };

        // Verify the message structure
        const errMsg = this.CartMessage.verify(protoCart);
        if (errMsg) {
            throw new Error(`Invalid cart message: ${errMsg}`);
        }

        // Create and encode the message
        const message = this.CartMessage.create(protoCart);
        const buffer = this.CartMessage.encode(message).finish();
        
        logger.debug('Serialized cart to Redis', {
            userId: cart.userId,
            itemCount: cart.items.length,
        });

        return Buffer.from(buffer);
    }

    /**
     * Deserialize a Protobuf binary to Cart object.
     */
    private deserializeCart(buffer: Buffer): Cart {
        const message = this.CartMessage.decode(buffer);
        
        // Access the decoded message fields directly
        // protobufjs converts snake_case proto fields to camelCase JavaScript properties
        const cart = {
            userId: (message as any).userId || '',
            items: ((message as any).items || []).map((item: any) => ({
                productId: item.productId || '',
                quantity: item.quantity || 0,
            })),
        };
        
        logger.debug('Deserialized cart from Redis', { 
            userId: cart.userId, 
            itemCount: cart.items.length,
            items: cart.items,
            rawMessage: JSON.stringify(message)
        });
        
        return cart;
    }

    /**
     * Generate Redis key for a user's cart.
     */
    private getCartKey(userId: string): string {
        return `cart:${userId}`;
    }

    /**
     * Add an item to a user's cart or increment quantity if it already exists.
     */
    async addItem(userId: string, productId: string, quantity: number): Promise<void> {
        const startTime = Date.now();
        try {
            const key = this.getCartKey(userId);

            // Get existing cart
            const cart = await this.getCart(userId);

            // Find existing item
            const existingItem = cart.items.find(item => item.productId === productId);

            if (existingItem) {
                // Increment quantity for existing item
                existingItem.quantity += quantity;
                logger.debug('Incremented item quantity in Redis', { userId, productId, newQuantity: existingItem.quantity });
            } else {
                // Add new item
                cart.items.push({ productId, quantity });
                logger.debug('Added new item to cart in Redis', { userId, productId, quantity });
            }

            // Serialize and store
            const serialized = this.serializeCart(cart);
            await this.client.set(key, serialized);

            const duration = (Date.now() - startTime) / 1000;
            recordStorageOperation('addItem', 'success', duration);
        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            recordStorageOperation('addItem', 'error', duration);
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to add item to cart in Redis', { userId, productId, error: message });
            throw new Error(`Can't access cart storage: ${message}`);
        }
    }

    /**
     * Retrieve a user's complete shopping cart.
     * Returns an empty cart if none exists.
     */
    async getCart(userId: string): Promise<Cart> {
        const startTime = Date.now();
        try {
            const key = this.getCartKey(userId);
            const data = await this.client.getBuffer(key);

            if (!data) {
                // Return empty cart if not found
                logger.debug('No cart found in Redis, returning empty cart', { userId });
                const duration = (Date.now() - startTime) / 1000;
                recordStorageOperation('getCart', 'success', duration);
                return { userId, items: [] };
            }

            // Deserialize cart
            const cart = this.deserializeCart(data);
            logger.debug('Retrieved cart from Redis', { userId, itemCount: cart.items.length });

            const duration = (Date.now() - startTime) / 1000;
            recordStorageOperation('getCart', 'success', duration);
            return cart;

        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            recordStorageOperation('getCart', 'error', duration);
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to get cart from Redis', { userId, error: message });
            throw new Error(`Can't access cart storage: ${message}`);
        }
    }

    /**
     * Remove all items from a user's cart.
     */
    async emptyCart(userId: string): Promise<void> {
        const startTime = Date.now();
        try {
            const key = this.getCartKey(userId);
            const emptyCart: Cart = { userId, items: [] };

            // Serialize and store empty cart
            const serialized = this.serializeCart(emptyCart);
            await this.client.set(key, serialized);

            logger.debug('Emptied cart in Redis', { userId });

            const duration = (Date.now() - startTime) / 1000;
            recordStorageOperation('emptyCart', 'success', duration);
        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            recordStorageOperation('emptyCart', 'error', duration);
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to empty cart in Redis', { userId, error: message });
            throw new Error(`Can't access cart storage: ${message}`);
        }
    }

    /**
     * Check if the storage backend is accessible.
     */
    async ping(): Promise<boolean> {
        try {
            const result = await this.client.ping();
            return result === 'PONG';
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Redis ping failed', { error: message });
            return false;
        }
    }

    /**
     * Close the Redis connection.
     */
    async close(): Promise<void> {
        await this.client.quit();
        logger.info('Redis connection closed');
    }
}
