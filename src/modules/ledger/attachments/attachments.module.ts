import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma/prisma.module";
import { LedgerService } from "../ledger.service";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";

@Module({
  imports: [PrismaModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, LedgerService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
