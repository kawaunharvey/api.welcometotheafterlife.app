import { Module } from "@nestjs/common";
import { AppDataController } from "./app-data.controller";
import { AppDataService } from "./app-data.service";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@Module({
  controllers: [AppDataController],
  providers: [AppDataService, PrismaService, RedisService],
  exports: [AppDataService],
})
export class AppDataModule {}
