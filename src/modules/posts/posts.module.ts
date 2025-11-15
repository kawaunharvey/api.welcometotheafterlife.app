import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../prisma/prisma.module";
import { FeedsModule } from "../feeds/feeds.module";
import { AuditModule } from "../audit/audit.module";
import { UploadsModule } from "../uploads/uploads.module";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";
import { ContentServiceClient } from "@/common";

@Module({
  imports: [HttpModule, PrismaModule, FeedsModule, AuditModule, UploadsModule],
  controllers: [PostsController],
  providers: [PostsService, ContentServiceClient],
  exports: [PostsService],
})
export class PostsModule {}
