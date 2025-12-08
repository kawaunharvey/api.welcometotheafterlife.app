import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { FeedsService } from "./feeds.service";
import { FeedsController } from "./feeds.controller";
import { RedisService } from "../redis/redis.service";

@Module({
  imports: [PrismaModule],
  providers: [FeedsService, RedisService],
  controllers: [FeedsController],
  exports: [FeedsService],
})
export class FeedsModule {}
