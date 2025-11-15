import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { BillingWebhookService } from "./billing-webhook.service";

@Controller("fundraising/webhooks")
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(private readonly billingWebhookService: BillingWebhookService) {}

  @Post("billing")
  async handleBillingWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers("signature") signature?: string,
    @Headers("webhook-id") webhookId?: string,
  ): Promise<{ success: boolean }> {
    try {
      this.logger.debug("Received billing webhook", {
        type: payload.type,
        webhookId,
        hasSignature: !!signature,
      });

      // Add signature to payload for verification
      const webhookEvent = {
        type: payload.type as string,
        data: payload.data as Record<string, unknown>,
        signature,
        id: webhookId,
      };

      await this.billingWebhookService.handleWebhook(webhookEvent);

      this.logger.debug("Billing webhook processed successfully", {
        type: payload.type,
        webhookId,
      });

      return { success: true };
    } catch (error) {
      this.logger.error("Failed to process billing webhook", error, {
        type: payload?.type,
        webhookId,
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      // Return success to avoid retries for non-recoverable errors
      // Log the error for investigation
      return { success: true };
    }
  }
}
