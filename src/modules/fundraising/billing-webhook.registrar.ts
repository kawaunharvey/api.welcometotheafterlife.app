import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BillingClient } from "../../common/http-client/billing-service.client";

@Injectable()
export class BillingWebhookRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingWebhookRegistrar.name);

  constructor(
    private readonly billingClient: BillingClient,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const autoRegister = this.configService.get<string>(
      "BILLING_WEBHOOK_AUTOREGISTER",
      "true",
    );

    if (autoRegister?.toLowerCase() === "false") {
      this.logger.log("Billing webhook auto-registration disabled");
      return;
    }

    const signingSecret =
      this.configService.get<string>("AFTERLIFE_WEBHOOK_SECRET") ||
      this.configService.get<string>("BILLING_WEBHOOK_SECRET");

    if (!signingSecret) {
      this.logger.warn(
        "No webhook signing secret configured; skipping billing webhook registration",
      );
      return;
    }

    const rawBaseUrl =
      this.configService.get<string>("BILLING_WEBHOOK_URL") ||
      this.configService.get<string>("AFTERLIFE_WEBHOOK_URL") ||
      this.configService.get<string>("SERVICE_PUBLIC_BASE_URL") ||
      `http://localhost:${this.configService.get<number>("PORT", 3000)}`;

    // Guard against the webhook path already being present (avoids duplicate segments)
    const baseUrl = rawBaseUrl
      .replace(/\/fundraising\/webhooks\/billing\/?$/, "")
      .replace(/\/$/, "");
    const webhookUrl = `${baseUrl}/fundraising/webhooks/billing`;

    this.logger.debug("Resolved billing webhook URL", { webhookUrl });
    const tenantId = this.configService.get<string>("BILLING_TENANT_ID");

    const events = [
      "payment.succeeded",
      "payment.failed",
      "payment.refunded",
      "payout.created",
      "payout.paid",
      "payout.failed",
      "payout.canceled",
      "beneficiary.onboarding.updated",
      "account.updated",
    ];

    try {
      await this.billingClient.ensureWebhookEndpoint({
        serviceKey: "afterlife",
        url: webhookUrl,
        signingSecret,
        events,
        tenantId,
      });
    } catch (error) {
      this.logger.error(
        "Failed to register billing webhook endpoint",
        error as Error,
      );
    }
  }
}
