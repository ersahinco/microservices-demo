/**
 * Storage abstraction layer for cart operations.
 * Provides interface for different storage backends (Redis, in-memory).
 */

/**
 * Represents a single item in a shopping cart.
 */
export interface CartItem {
  /** Unique identifier for the product */
  productId: string;
  /** Quantity of the product in the cart */
  quantity: number;
}

/**
 * Represents a user's shopping cart.
 */
export interface Cart {
  /** Unique identifier for the user */
  userId: string;
  /** List of items in the cart */
  items: CartItem[];
}

/**
 * Storage interface for cart operations.
 * Implementations can use Redis, in-memory storage, or other backends.
 */
export interface ICartStore {
  /**
   * Add an item to a user's cart or increment quantity if it already exists.
   * @param userId - The user's unique identifier
   * @param productId - The product's unique identifier
   * @param quantity - The quantity to add (must be positive)
   * @throws Error if storage operation fails
   */
  addItem(userId: string, productId: string, quantity: number): Promise<void>;

  /**
   * Retrieve a user's complete shopping cart.
   * @param userId - The user's unique identifier
   * @returns The user's cart, or an empty cart if none exists
   * @throws Error if storage operation fails
   */
  getCart(userId: string): Promise<Cart>;

  /**
   * Remove all items from a user's cart.
   * @param userId - The user's unique identifier
   * @throws Error if storage operation fails
   */
  emptyCart(userId: string): Promise<void>;

  /**
   * Check if the storage backend is accessible.
   * @returns true if storage is accessible, false otherwise
   */
  ping(): Promise<boolean>;
}
