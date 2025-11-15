import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { InteractionsController } from "./interactions.controller";
import { InteractionsService } from "./interactions.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [InteractionsController],
  providers: [InteractionsService],
  exports: [InteractionsService],
})
export class InteractionsModule {}
