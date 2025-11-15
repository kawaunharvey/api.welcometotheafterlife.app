import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { createHmac } from "crypto";
import { ConfigService } from "@nestjs/config";
import { VerificationService } from "./verification-simple.service";

interface DmfWebhookPayload {
  search_id: string;
  status: "completed" | "failed" | "error";
  results?: {
    matches: Array<{
      ssn: string;
      first_name: string;
      last_name: string;
      date_of_death?: string;
      confidence_score: number;
    }>;
    total_matches: number;
  };
  error?: {
    code: string;
    message: string;
  };
  timestamp: string;
}

@Controller("webhooks/dmf")
export class DmfWebhookController {
  private readonly logger = new Logger(DmfWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly verificationService: VerificationService,
  ) {}

  @Post()
  async handleDmfWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Body() payload: DmfWebhookPayload,
    @Headers("x-compliancely-signature") signature: string,
  ) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(request.rawBody, signature)) {
        this.logger.error("Invalid webhook signature", {
          signature,
          searchId: payload.search_id,
        });
        throw new HttpException(
          "Invalid webhook signature",
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.logger.log("Processing DMF webhook", {
        searchId: payload.search_id,
        status: payload.status,
      });

      // Process the webhook payload
      await this.processDmfWebhookResult(payload);

      return { success: true };
    } catch (error) {
      this.logger.error("Error processing DMF webhook", {
        error: error.message,
        stack: error.stack,
        searchId: payload?.search_id,
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private verifyWebhookSignature(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): boolean {
    if (!signature || !rawBody) {
      return false;
    }

    const webhookSecret = this.configService.get<string>("DMF_WEBHOOK_SECRET");
    if (!webhookSecret) {
      this.logger.error("DMF_WEBHOOK_SECRET not configured");
      return false;
    }

    try {
      // Remove the 'sha256=' prefix if present
      const cleanSignature = signature.replace(/^sha256=/, "");

      // Calculate expected signature
      const expectedSignature = createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      // Use timing-safe comparison
      return this.timingSafeEqual(cleanSignature, expectedSignature);
    } catch (error) {
      this.logger.error("Error verifying webhook signature", {
        error: error.message,
      });
      return false;
    }
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  private async processDmfWebhookResult(payload: DmfWebhookPayload) {
    try {
      // Find the provider check by search ID
      const providerCheck =
        await this.verificationService.findProviderCheckBySearchId(
          payload.search_id,
        );

      if (!providerCheck) {
        this.logger.warn("Provider check not found for search ID", {
          searchId: payload.search_id,
        });
        return;
      }

      // Update provider check with webhook results
      await this.verificationService.updateProviderCheckFromWebhook(
        providerCheck.id,
        {
          status: payload.status,
          results: payload.results,
          error: payload.error,
          completedAt: new Date(),
        },
      );

      this.logger.log("Successfully processed DMF webhook result", {
        searchId: payload.search_id,
        providerCheckId: providerCheck.id,
        status: payload.status,
        matchCount: payload.results?.total_matches || 0,
      });
    } catch (error) {
      this.logger.error("Error processing DMF webhook result", {
        error: error.message,
        stack: error.stack,
        searchId: payload.search_id,
      });
      throw error;
    }
  }
}
