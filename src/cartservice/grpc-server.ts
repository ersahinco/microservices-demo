import path from "path";
import { Server, ServerCredentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { createClient } from "redis";

// ---- config ----
const CART_PROTO_PATH = process.env.CARTSERVICE_PROTO_PATH
  || path.resolve(__dirname, "../proto/Cart.proto");
const HEALTH_PROTO_PATH = path.resolve(__dirname, "../proto/health/health.proto");
const PORT = process.env.PORT || process.env.GRPC_PORT || "7070";

// Redis URL (REDIS_ADDR like "redis-cart:6379")
const redisAddr = process.env.REDIS_ADDR || "127.0.0.1:6379";
const redisUrl = redisAddr.startsWith("redis://") ? redisAddr : `redis://${redisAddr}`;

// ---- load protos (snake_case preserved) ----
const packageDefinition = loadSync([CART_PROTO_PATH, HEALTH_PROTO_PATH], {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
});
const descriptor = loadPackageDefinition(packageDefinition) as any;
const hipstershop = descriptor.hipstershop;
const healthPkg = descriptor.grpc.health.v1;

// Health response enum (from the proto). If absent, fallback to numbers.
const ServingStatus = (healthPkg?.HealthCheckResponse?.ServingStatus) || {
  UNKNOWN: 0, SERVING: 1, NOT_SERVING: 2, SERVICE_UNKNOWN: 3,
};

// ---- simple cart types matching hipstershop proto ----
type CartItem = { product_id: string; quantity: number };
type Cart = { user_id: string; items: CartItem[] };

// ---- Redis (resilient) ----
const key = (userId: string) => `cart:${userId}`;

const redisClient = createClient({
  url: redisUrl,
  socket: { reconnectStrategy: (r) => Math.min(1000, r * 50), keepAlive: 1 },
});

redisClient.on("error", (err) => {
  console.error("[redis] error:", err?.message || err);
  setServing(false); // reflect into health
});
redisClient.on("reconnecting", () => console.warn("[redis] reconnecting..."));
redisClient.on("end", () => {
  console.warn("[redis] connection ended");
  setServing(false);
});
redisClient.on("ready", () => console.log("[redis] ready"));

async function getCart(userId: string): Promise<Cart> {
  const raw = await redisClient.get(key(userId));
  if (!raw) return { user_id: userId, items: [] };
  try {
    const obj = JSON.parse(raw) as Cart;
    obj.user_id = obj.user_id || userId;
    obj.items = Array.isArray(obj.items) ? obj.items : [];
    return obj;
  } catch {
    return { user_id: userId, items: [] };
  }
}
async function putCart(cart: Cart): Promise<void> {
  await redisClient.set(key(cart.user_id), JSON.stringify(cart));
}
async function emptyCart(userId: string): Promise<void> {
  await redisClient.del(key(userId));
}

// ---- gRPC server ----
function coerceQty(q: any): number {
  const n = Number(q ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : 1;
}

const server = new Server();

// ---- Health service (manual impl), default NOT_SERVING until Redis+bind ----
let serving = false;
function setServing(isServing: boolean) {
  serving = isServing;
}
server.addService(healthPkg.Health.service, {
  // Unary endpoint used by grpc_health_probe
  Check: (call: any, cb: any) => {
    const status = serving ? ServingStatus.SERVING : ServingStatus.NOT_SERVING;
    cb(null, { status });
  },
  // Stream endpoint: we immediately emit current status then end (simple)
  Watch: (call: any) => {
    const status = serving ? ServingStatus.SERVING : ServingStatus.NOT_SERVING;
    call.write({ status });
    call.end();
  },
});

server.addService(hipstershop.CartService.service, {
  async GetCart(call: any, cb: any) {
    try {
      const { user_id } = call.request || {};
      if (!user_id) return cb({ code: 3, message: "user_id required" });
      const cart = await getCart(user_id);
      cb(null, cart);
    } catch (e: any) {
      console.error("[rpc GetCart]", e);
      cb({ code: 13, message: e?.message || "internal" });
    }
  },
  async AddItem(call: any, cb: any) {
    try {
      const { user_id, item } = call.request || {};
      if (!user_id) return cb({ code: 3, message: "user_id required" });
      if (!item || !item.product_id) return cb({ code: 3, message: "item.product_id required" });

      const qty = coerceQty(item.quantity);
      const cart = await getCart(user_id);
      const existing = cart.items.find((i) => i.product_id === item.product_id);
      if (existing) existing.quantity = Math.min(existing.quantity + qty, 9999);
      else cart.items.push({ product_id: item.product_id, quantity: qty });
      await putCart(cart);
      cb(null, {}); // Empty
    } catch (e: any) {
      console.error("[rpc AddItem]", e);
      cb({ code: 13, message: e?.message || "internal" });
    }
  },
  async EmptyCart(call: any, cb: any) {
    try {
      const { user_id } = call.request || {};
      if (!user_id) return cb({ code: 3, message: "user_id required" });
      await emptyCart(user_id);
      cb(null, {}); // Empty
    } catch (e: any) {
      console.error("[rpc EmptyCart]", e);
      cb({ code: 13, message: e?.message || "internal" });
    }
  },
});

// ---- bootstrap (single connect + bind, then mark SERVING) ----
(async () => {
  try {
    await redisClient.connect();
    await redisClient.ping(); // first contact

    server.bindAsync(`0.0.0.0:${PORT}`, ServerCredentials.createInsecure(), (err, bindPort) => {
      if (err) {
        console.error("[bind] failed:", err);
        process.exit(1);
      }
      // grpc-js no longer needs server.start(); binding opens the port.
      setServing(true);
      console.log(`gRPC CartService running on :${bindPort}`);
    });

    process.on("SIGTERM", async () => {
      try { await redisClient.quit(); } finally { process.exit(0); }
    });
  } catch (err) {
    console.error("[startup] fatal:", err);
    process.exit(1);
  }
})();

// Crash reporters so nothing is hidden
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
  process.exit(1);
});
