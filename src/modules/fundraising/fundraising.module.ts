import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { FundraisingController } from "./fundraising.controller";
import { BillingWebhookController } from "./billing-webhook.controller";
import { FundraisingService } from "./fundraising.service";
import { BillingWebhookService } from "./billing-webhook.service";
import { BillingClient } from "../../common/http-client/billing-service.client";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FeedsModule } from "../feeds/feeds.module";
import { BillingWebhookRegistrar } from "./billing-webhook.registrar";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    NotificationsModule,
    FeedsModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  controllers: [FundraisingController, BillingWebhookController],
  providers: [
    FundraisingService,
    BillingWebhookService,
    BillingWebhookRegistrar,
    BillingClient,
  ],
  exports: [FundraisingService],
})
export class FundraisingModule {}
