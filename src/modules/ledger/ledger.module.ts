import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ActionsModule } from "./actions/actions.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { CollaboratorsModule } from "./collaborators/collaborators.module";
import { StatusUpdatesModule } from "./status-updates/status-updates.module";
import { TemplatesModule } from "./templates/templates.module";
import { LedgerController } from "./ledger.controller";
import { LedgerService } from "./ledger.service";

@Module({
  imports: [
    PrismaModule,
    ActionsModule,
    AttachmentsModule,
    CollaboratorsModule,
    StatusUpdatesModule,
    TemplatesModule,
  ],
  controllers: [LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
