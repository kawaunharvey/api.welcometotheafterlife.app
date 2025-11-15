import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  VerificationController,
  MemorialVerificationController,
} from "./verification.controller";
import { DmfWebhookController } from "./webhook.controller";
import { VerificationService } from "./verification-simple.service";
import { SensitiveDataService } from "./sensitive-data.service";
import { DmfService } from "./dmf.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [
    VerificationController,
    MemorialVerificationController,
    DmfWebhookController,
  ],
  providers: [VerificationService, SensitiveDataService, DmfService],
  exports: [VerificationService, SensitiveDataService, DmfService],
})
export class VerificationModule {}
