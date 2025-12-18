import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersPublicController } from "./users-public.controller";
import { UsersService } from "./users.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { CacheModule } from "../../common/cache/cache.module";

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [UsersController, UsersPublicController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
