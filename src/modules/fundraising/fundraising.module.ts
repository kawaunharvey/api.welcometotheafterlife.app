import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { FundraisingController } from "./fundraising.controller";
import { BillingWebhookController } from "./billing-webhook.controller";
import { FundraisingService } from "./fundraising.service";
import { BillingWebhookService } from "./billing-webhook.service";
import { BillingClient } from "./clients/billing.client";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  controllers: [FundraisingController, BillingWebhookController],
  providers: [FundraisingService, BillingWebhookService, BillingClient],
  exports: [FundraisingService],
})
export class FundraisingModule {}
