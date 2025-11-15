import { Injectable } from "@nestjs/common";
import { Redis } from "@upstash/redis";

@Injectable()
export class RedisService {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.redis.get<T>(key);
  }

  async set<T = unknown>(
    key: string,
    value: T,
    ttlSeconds?: number
  ): Promise<"OK" | null> {
    if (ttlSeconds) {
      return this.redis.set(key, value, { ex: ttlSeconds }) as Promise<
        "OK" | null
      >;
    }
    return this.redis.set(key, value) as Promise<"OK" | null>;
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async ttl(key: string): Promise<number | null> {
    return this.redis.ttl(key);
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }
}
