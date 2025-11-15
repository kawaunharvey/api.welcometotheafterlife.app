import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

export interface CreateCheckoutRequest {
  kind: "donation";
  amountCents: number;
  currency: string;
  memorialId: string;
  fundraisingId: string;
  connectAccountId?: string;
  feePlanId?: string;
  metadata: {
    afterlifeMemorialId: string;
    afterlifeFundraisingId: string;
    donorDisplay?: string;
    message?: string;
  };
  returnUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResponse {
  checkoutUrl: string;
  paymentId: string;
}

export interface CreatePaymentIntentRequest {
  kind: "donation";
  amountCents: number;
  currency: string;
  memorialId: string;
  fundraisingId: string;
  connectAccountId?: string;
  feePlanId?: string;
  metadata: {
    afterlifeMemorialId: string;
    afterlifeFundraisingId: string;
    donorDisplay?: string;
    message?: string;
  };
}

export interface CreatePaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  publishableKey: string;
  ephemeralKey?: string; // For customer-based flows
}

export interface CreateBeneficiaryRequest {
  memorialId: string;
  fundraisingId: string;
  beneficiaryType: string;
  beneficiaryName: string;
  email?: string;
  metadata: {
    afterlifeMemorialId: string;
    afterlifeFundraisingId: string;
  };
}

export interface CreateBeneficiaryResponse {
  beneficiaryId: string;
  connectAccountId: string;
  onboardingUrl: string;
  onboardingStatus: string;
}

export interface CreatePayoutRequest {
  fundraisingId: string;
  memorialId: string;
  amountCents: number;
  currency: string;
  connectAccountId: string;
  metadata: {
    afterlifeMemorialId: string;
    afterlifeFundraisingId: string;
  };
  note: string;
}

export interface CreatePayoutResponse {
  payoutId: string;
  status: string;
  estimatedArrival?: string;
  destinationSummary: string;
}

@Injectable()
export class BillingClient {
  private readonly logger = new Logger(BillingClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;

  // Token management
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl =
      this.configService.get("BILLING_SERVICE_API_URL") ||
      "http://localhost:3000";
    this.apiKey = this.configService.get("BILLING_SERVICE_API_KEY") || "";
    this.secretKey = this.configService.get("BILLING_SERVICE_SECRET_KEY") || "";
  }

  /**
   * Get access token using service key authentication
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (
      this.accessToken &&
      this.tokenExpiresAt &&
      Date.now() < this.tokenExpiresAt
    ) {
      return this.accessToken;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/auth/service-login`,
          {
            apiKey: this.apiKey,
            secretKey: this.secretKey,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

      if (!response?.data) {
        throw new Error(
          "No response data from service authentication endpoint",
        );
      }

      this.accessToken = response.data.access_token;
      // Calculate expiration time (expires_in is in seconds)
      this.tokenExpiresAt =
        Date.now() + (response.data.expires_in || 86400) * 1000;

      this.logger.debug("Billing service access token obtained successfully");
      return this.accessToken!;
    } catch (error) {
      this.logger.error(
        "Failed to obtain access token from billing service",
        error,
      );
      throw error;
    }
  }

  private async getHeaders(idempotencyKey?: string) {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    return headers;
  }

  async createPaymentOrCheckout(
    request: CreateCheckoutRequest,
    idempotencyKey?: string,
  ): Promise<CreateCheckoutResponse> {
    try {
      this.logger.debug("Creating payment/checkout", {
        amountCents: request.amountCents,
        currency: request.currency,
        fundraisingId: request.fundraisingId,
      });

      const headers = await this.getHeaders(idempotencyKey);
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/payments/create`, request, {
          headers,
        }),
      );

      this.logger.debug("Payment/checkout created successfully", {
        paymentId: response.data.paymentId,
      });

      return response.data;
    } catch (error) {
      this.logger.error("Failed to create payment/checkout", error);
      throw error;
    }
  }

  async createPaymentIntent(
    request: CreatePaymentIntentRequest,
    idempotencyKey?: string,
  ): Promise<CreatePaymentIntentResponse> {
    try {
      this.logger.debug("Creating payment intent", {
        amountCents: request.amountCents,
        currency: request.currency,
        fundraisingId: request.fundraisingId,
      });

      const headers = await this.getHeaders(idempotencyKey);
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/payments/create-intent`,
          request,
          {
            headers,
          },
        ),
      );

      this.logger.debug("Payment intent created successfully", {
        paymentIntentId: response.data.paymentIntentId,
      });

      return response.data;
    } catch (error) {
      this.logger.error("Failed to create payment intent", error);
      throw error;
    }
  }

  async startBeneficiaryOnboarding(
    request: CreateBeneficiaryRequest,
  ): Promise<CreateBeneficiaryResponse> {
    try {
      this.logger.debug("Starting beneficiary onboarding", {
        beneficiaryType: request.beneficiaryType,
        beneficiaryName: request.beneficiaryName,
        fundraisingId: request.fundraisingId,
      });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/beneficiaries/create-or-onboard`,
          request,
          { headers },
        ),
      );

      this.logger.debug("Beneficiary onboarding started successfully", {
        beneficiaryId: response.data.beneficiaryId,
        onboardingStatus: response.data.onboardingStatus,
      });

      return response.data;
    } catch (error) {
      this.logger.error("Failed to start beneficiary onboarding", error);
      throw error;
    }
  }

  async requestPayout(
    request: CreatePayoutRequest,
  ): Promise<CreatePayoutResponse> {
    try {
      this.logger.debug("Requesting payout", {
        amountCents: request.amountCents,
        currency: request.currency,
        fundraisingId: request.fundraisingId,
        connectAccountId: request.connectAccountId,
      });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/payouts/create`, request, {
          headers,
        }),
      );

      this.logger.debug("Payout requested successfully", {
        payoutId: response.data.payoutId,
        status: response.data.status,
      });

      return response.data;
    } catch (error) {
      this.logger.error("Failed to request payout", error);
      throw error;
    }
  }
}
