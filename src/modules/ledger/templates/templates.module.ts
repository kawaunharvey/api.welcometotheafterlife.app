import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma/prisma.module";
import { LedgerService } from "../ledger.service";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";

@Module({
  imports: [PrismaModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, LedgerService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
