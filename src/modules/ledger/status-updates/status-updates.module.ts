import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma/prisma.module";
import { LedgerService } from "../ledger.service";
import { StatusUpdatesController } from "./status-updates.controller";
import { StatusUpdatesService } from "./status-updates.service";

@Module({
  imports: [PrismaModule],
  controllers: [StatusUpdatesController],
  providers: [StatusUpdatesService, LedgerService],
  exports: [StatusUpdatesService],
})
export class StatusUpdatesModule {}
