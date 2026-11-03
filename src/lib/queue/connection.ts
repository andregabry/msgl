import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let _redis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!_redis) {
    _redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy(times) {
        if (process.env.NEXT_PHASE === "phase-production-build") {
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
    });
    _redis.on("error", (err) => {
      console.warn("[REDIS QUEUE WARNING] Erro de ligação ao Redis:", err.message);
    });
  }
  return _redis;
}

export const redisConnection = new Proxy({} as Redis, {
  get(target, prop, receiver) {
    const instance = getRedisConnection();
    const val = Reflect.get(instance, prop, receiver);
    if (typeof val === "function") {
      return val.bind(instance);
    }
    return val;
  },
});
