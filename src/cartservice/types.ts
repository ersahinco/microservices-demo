interface CartItem {
    id: string;
    name: string;
    quantity: number;
    price: number;
}

interface Cart {
    userId: string;
    items: CartItem[];
}

export { CartItem, Cart };