import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma/prisma.module";
import { LedgerService } from "../ledger.service";
import { CollaboratorsController } from "./collaborators.controller";
import { CollaboratorsService } from "./collaborators.service";

@Module({
  imports: [PrismaModule],
  controllers: [CollaboratorsController],
  providers: [CollaboratorsService, LedgerService],
  exports: [CollaboratorsService],
})
export class CollaboratorsModule {}
