import { Module } from "@nestjs/common";
import { CacheService } from "./cache.service";
import { ObituaryCacheService } from "./obituary-cache.service";

@Module({
  providers: [CacheService, ObituaryCacheService],
  exports: [CacheService, ObituaryCacheService],
})
export class CacheModule {}
