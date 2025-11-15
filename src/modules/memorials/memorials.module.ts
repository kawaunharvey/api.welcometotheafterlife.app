import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { FeedsModule } from "../feeds/feeds.module";
import { AuditModule } from "../audit/audit.module";
import { CommonModule } from "../../common";
import { MemorialsController } from "./memorials.controller";
import { MemorialsService } from "./memorials.service";
import { MemorialObituaryService } from "./memorial-obituary.service";

@Module({
  imports: [PrismaModule, AuthModule, FeedsModule, AuditModule, CommonModule],
  controllers: [MemorialsController],
  providers: [MemorialsService, MemorialObituaryService],
  exports: [MemorialsService, MemorialObituaryService],
})
export class MemorialsModule {}
