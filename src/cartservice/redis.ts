import { createClient } from 'redis';
import { CartItem } from './types';

const redisClient = createClient();

redisClient.on('error', (err: Error) => {
    console.error('Redis Client Error', err);
});

const connectRedis = async () => {
    await redisClient.connect();
};

const setCartItem = async (key: string, item: CartItem) => {
    await redisClient.set(key, JSON.stringify(item));
};

const getCartItem = async (key: string): Promise<CartItem | null> => {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
};

const deleteCartItem = async (key: string) => {
    await redisClient.del(key);
};

export { connectRedis, setCartItem, getCartItem, deleteCartItem };