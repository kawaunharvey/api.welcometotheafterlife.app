import { Injectable, Logger } from "@nestjs/common";
import { Redis } from "@upstash/redis";

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      return await this.redis.get<T>(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  async set<T = unknown>(
    key: string,
    value: T,
    options?: CacheOptions,
  ): Promise<"OK" | null> {
    try {
      let result: Promise<"OK" | null>;

      if (options?.ttl) {
        result = this.redis.set(key, value, { ex: options.ttl }) as Promise<
          "OK" | null
        >;
      } else {
        result = this.redis.set(key, value) as Promise<"OK" | null>;
      }

      // Store cache tags for invalidation
      if (options?.tags) {
        await this.addCacheTags(key, options.tags);
      }

      return await result;
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      return null;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const keys: string[] = [];

      // Get all keys associated with each tag
      for (const tag of tags) {
        const tagKeys = await this.redis.smembers(`tag:${tag}`);
        keys.push(...tagKeys);
      }

      if (keys.length > 0) {
        // Delete all keys
        await this.redis.del(...keys);

        // Clean up tag sets
        for (const tag of tags) {
          await this.redis.del(`tag:${tag}`);
        }

        this.logger.debug(
          `Invalidated ${keys.length} cache keys by tags: ${tags.join(", ")}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error invalidating cache by tags ${tags.join(", ")}:`,
        error,
      );
    }
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.getKeysByPattern(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(
          `Invalidated ${keys.length} cache keys by pattern: ${pattern}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error invalidating cache by pattern ${pattern}:`,
        error,
      );
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }

  async flushAll(): Promise<void> {
    try {
      await this.redis.flushall();
      this.logger.debug("Flushed all cache keys");
    } catch (error) {
      this.logger.error("Error flushing all cache keys:", error);
    }
  }

  // Helper method to add cache tags
  private async addCacheTags(key: string, tags: string[]): Promise<void> {
    try {
      for (const tag of tags) {
        await this.redis.sadd(`tag:${tag}`, key);
      }
    } catch (error) {
      this.logger.error(`Error adding cache tags for key ${key}:`, error);
    }
  }

  // Helper method to get keys by pattern
  private async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      // Note: Upstash Redis doesn't support SCAN, so we'll use a simple approach
      // For production, consider maintaining a key registry or using a different approach
      const allKeys = await this.redis.keys(pattern);
      return Array.isArray(allKeys) ? allKeys : [];
    } catch (error) {
      this.logger.error(`Error getting keys by pattern ${pattern}:`, error);
      return [];
    }
  }

  // Utility method to generate cache keys
  static generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(":")}`;
  }

  // Utility method to check if cache is available
  async isAvailable(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error("Cache service is not available:", error);
      return false;
    }
  }
}
