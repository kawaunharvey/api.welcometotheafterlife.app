import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { FeedsService } from "./feeds.service";
import { FeedsController } from "./feeds.controller";
import { RedisService } from "../redis/redis.service";
import { FeedTemplateService } from "./template.service";

@Module({
  imports: [PrismaModule],
  providers: [FeedsService, RedisService, FeedTemplateService],
  controllers: [FeedsController],
  exports: [FeedsService, FeedTemplateService],
})
export class FeedsModule {}
