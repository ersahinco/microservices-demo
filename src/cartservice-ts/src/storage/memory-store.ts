/**
 * In-memory implementation of cart storage.
 * Suitable for development and testing. Data is lost on service restart.
 */

import { ICartStore, Cart } from './cart-store';
import { logger } from '../utils/logger';
import { recordStorageOperation } from '../telemetry/metrics';

/**
 * In-memory cart store using a Map for storage.
 */
export class MemoryStore implements ICartStore {
    private carts: Map<string, Cart>;

    constructor() {
        this.carts = new Map();
        logger.info('MemoryStore initialized');
    }

    /**
     * Add an item to a user's cart or increment quantity if it already exists.
     */
    async addItem(userId: string, productId: string, quantity: number): Promise<void> {
        const startTime = Date.now();
        const cart = this.carts.get(userId) || { userId, items: [] };

        // Find existing item
        const existingItem = cart.items.find(item => item.productId === productId);

        if (existingItem) {
            // Increment quantity for existing item
            existingItem.quantity += quantity;
            logger.debug('Incremented item quantity', { userId, productId, newQuantity: existingItem.quantity });
        } else {
            // Add new item
            cart.items.push({ productId, quantity });
            logger.debug('Added new item to cart', { userId, productId, quantity });
        }

        this.carts.set(userId, cart);
        
        const duration = (Date.now() - startTime) / 1000;
        recordStorageOperation('addItem', 'success', duration);
    }

    /**
     * Retrieve a user's complete shopping cart.
     * Returns an empty cart if none exists.
     */
    async getCart(userId: string): Promise<Cart> {
        const startTime = Date.now();
        const cart = this.carts.get(userId);

        if (cart) {
            logger.debug('Retrieved cart from memory', { userId, itemCount: cart.items.length });
            const duration = (Date.now() - startTime) / 1000;
            recordStorageOperation('getCart', 'success', duration);
            return cart;
        }

        // Return empty cart if not found
        logger.debug('No cart found, returning empty cart', { userId });
        const duration = (Date.now() - startTime) / 1000;
        recordStorageOperation('getCart', 'success', duration);
        return { userId, items: [] };
    }

    /**
     * Remove all items from a user's cart.
     */
    async emptyCart(userId: string): Promise<void> {
        const startTime = Date.now();
        this.carts.set(userId, { userId, items: [] });
        logger.debug('Emptied cart', { userId });
        
        const duration = (Date.now() - startTime) / 1000;
        recordStorageOperation('emptyCart', 'success', duration);
    }

    /**
     * Check if the storage backend is accessible.
     * Always returns true for in-memory storage.
     */
    async ping(): Promise<boolean> {
        return true;
    }
}
