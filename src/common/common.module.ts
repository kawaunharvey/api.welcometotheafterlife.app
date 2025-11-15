import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { ContentServiceClient } from "./http-client/content-service.client";
import { ObituaryServiceClient } from "./http-client/obituary-service.client";
import { CacheModule } from "./cache/cache.module";

@Module({
  imports: [HttpModule, ConfigModule, CacheModule],
  providers: [ContentServiceClient, ObituaryServiceClient],
  exports: [ContentServiceClient, ObituaryServiceClient, CacheModule],
})
export class CommonModule {}
