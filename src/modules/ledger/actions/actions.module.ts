import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma/prisma.module";
import { LedgerService } from "../ledger.service";
import { ActionsController } from "./actions.controller";
import { ActionsService } from "./actions.service";

@Module({
  imports: [PrismaModule],
  controllers: [ActionsController],
  providers: [ActionsService, LedgerService],
  exports: [ActionsService],
})
export class ActionsModule {}
