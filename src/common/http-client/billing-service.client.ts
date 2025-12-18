import { HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AxiosError } from "axios";

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
  applicationFeeAmount?: number;
  tipAmount?: number;
  coverPlatformFee?: boolean;
  metadata: {
    afterlifeMemorialId: string;
    afterlifeFundraisingId: string;
    donorDisplay?: string;
    message?: string;
    donorEmail?: string;
  };
  customerEmail?: string;
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
  phone?: string;
  ssnLast4?: string;
  dobDay?: number;
  dobMonth?: number;
  dobYear?: number;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  businessName?: string;
  businessWebsite?: string;
  statementDescriptor?: string;
  tosDate?: number;
  tosIp?: string;
  metadata: {
    afterlifeMemorialId: string;
    afterlifeFundraisingId: string;
  };
}

export interface CreateFinancialConnectionsSessionRequest {
  connectAccountId: string;
  returnUrl?: string;
}

export interface CreateFinancialConnectionsSessionResponse {
  sessionId: string;
  clientSecret: string;
  livemode: boolean;
  connectAccountId: string;
}

export interface GetFinancialConnectionsSessionRequest {
  connectAccountId: string;
  sessionId: string;
}

export interface GetFinancialConnectionsSessionResponse {
  sessionId: string;
  accounts: unknown[];
  livemode: boolean;
}

export interface AttachFinancialConnectionRequest {
  connectAccountId: string;
  paymentMethodId: string;
  customerId: string;
}

export interface AttachFinancialConnectionResponse {
  externalAccountId: string;
  account: unknown;
}

export interface CreatePayoutSetupIntentRequest {
  connectAccountId: string;
  customerId: string;
}

export interface CreatePayoutSetupIntentResponse {
  clientSecret: string | null;
  setupIntentId: string;
  livemode: boolean;
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
  mode: "STANDARD" | "INSTANT";
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
  notBeforeAt?: string;
  mode?: "STANDARD" | "INSTANT";
  feeCents?: number;
  netAmountCents?: number;
  destinationSummary: string;
}

export interface PayoutBalanceResponse {
  connectAccountId: string;
  stripeAccountId: string;
  livemode: boolean;
  available: Record<string, number>;
  pending: Record<string, number>;
  instantAvailable?: Record<string, number>;
  totalReleased?: Record<string, number>;
  retrievedAt: string;
}

export interface GetPayoutBankInfoResponse {
  hasBankAccount: boolean;
  bankLast4: string | null;
  bankName: string | null;
  bankCountry: string | null;
  bankCurrency: string | null;
  institutionName: string | null;
  payoutsEnabled: boolean;
  accountStatus: string;
}

export interface CreateCustomerRequest {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
  connectAccountId?: string;
}

export interface CreateCustomerResponse {
  customerId: string;
}

export interface DeleteBeneficiaryResponse {
  deleted: boolean;
}

@Injectable()
export class BillingClient {
  private readonly logger = new Logger(BillingClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly tenantId?: string;

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
    this.tenantId = this.configService.get("BILLING_TENANT_ID");
  }

  private handleAxiosError(context: string, error: any): never {
    const axiosError = error as AxiosError;
    if (axiosError?.isAxiosError) {
      const status = axiosError.response?.status ?? 500;
      const data = axiosError.response?.data;

      this.logger.error(`${context} (billing)`, {
        status,
        data,
        message: axiosError.message,
      });

      throw new HttpException(data || axiosError.message, status);
    }

    this.logger.error(`${context} (unknown error)`, error);
    throw error;
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

      // Dev-only: emit the token inline so pretty-print logging can't hide the payload.
      const expiresAtIso = new Date(this.tokenExpiresAt).toISOString();
      this.logger.warn(
        `Billing service access token (dev): ${this.accessToken} (expires ${expiresAtIso})`,
      );
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

    if (this.tenantId) {
      headers["Tenant-Id"] = this.tenantId;
    }

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
        applicationFeeAmount: request.applicationFeeAmount,
        tipAmount: request.tipAmount,
        coverPlatformFee: request.coverPlatformFee,
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

  async createFinancialConnectionsSession(
    request: CreateFinancialConnectionsSessionRequest,
  ): Promise<CreateFinancialConnectionsSessionResponse> {
    try {
      this.logger.debug("Creating financial connections session", {
        connectAccountId: request.connectAccountId,
      });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/beneficiaries/${request.connectAccountId}/financial-connections/session`,
          { returnUrl: request.returnUrl },
          { headers },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error(
        "Failed to create financial connections session",
        error,
      );
      throw error;
    }
  }

  async getFinancialConnectionsSession(
    request: GetFinancialConnectionsSessionRequest,
  ): Promise<GetFinancialConnectionsSessionResponse> {
    try {
      this.logger.debug("Retrieving financial connections session", {
        connectAccountId: request.connectAccountId,
        sessionId: request.sessionId,
      });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/beneficiaries/${request.connectAccountId}/financial-connections/session/${request.sessionId}/retrieve`,
          {},
          { headers },
        ),
      );

      this.logger.debug("Financial connections session retrieved", {
        sessionId: response.data.sessionId,
        accountsCount: response.data.accounts?.length || 0,
      });

      return response.data;
    } catch (error) {
      this.logger.error(
        "Failed to retrieve financial connections session",
        error,
      );
      throw error;
    }
  }

  async attachFinancialConnection(
    request: AttachFinancialConnectionRequest,
  ): Promise<AttachFinancialConnectionResponse> {
    try {
      this.logger.debug("Attaching payout bank", {
        connectAccountId: request.connectAccountId,
        paymentMethodId: request.paymentMethodId,
        customerId: request.customerId,
      });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/beneficiaries/${request.connectAccountId}/payout-bank/attach`,
          {
            paymentMethodId: request.paymentMethodId,
            customerId: request.customerId,
          },
          { headers },
        ),
      );

      this.logger.debug("Financial connection attached successfully", {
        externalAccountId: response.data.externalAccountId,
      });

      return response.data;
    } catch (error) {
      this.handleAxiosError("Failed to attach financial connection", error);
    }
  }

  async createPayoutSetupIntent(
    request: CreatePayoutSetupIntentRequest,
  ): Promise<CreatePayoutSetupIntentResponse> {
    try {
      this.logger.debug("Creating payout setup intent", {
        connectAccountId: request.connectAccountId,
        customerId: request.customerId,
      });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/beneficiaries/${request.connectAccountId}/payout-bank/setup-intent`,
          { customerId: request.customerId },
          { headers },
        ),
      );

      return response.data;
    } catch (error) {
      this.handleAxiosError("Failed to create payout setup intent", error);
    }
  }

  async deleteBeneficiary(connectAccountId: string): Promise<boolean> {
    try {
      this.logger.debug("Deleting beneficiary account", { connectAccountId });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.delete<DeleteBeneficiaryResponse>(
          `${this.baseUrl}/beneficiaries/${connectAccountId}`,
          { headers },
        ),
      );

      return response.data.deleted;
    } catch (error) {
      this.logger.error("Failed to delete beneficiary account", error);
      throw error;
    }
  }

  async getPayoutBankInfo(
    connectAccountId: string,
  ): Promise<GetPayoutBankInfoResponse> {
    try {
      this.logger.debug("Getting payout bank info", { connectAccountId });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.get<GetPayoutBankInfoResponse>(
          `${this.baseUrl}/beneficiaries/${connectAccountId}/payout-bank`,
          { headers },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error("Failed to get payout bank info", error);
      throw error;
    }
  }

  async createCustomer(
    request: CreateCustomerRequest,
  ): Promise<CreateCustomerResponse> {
    try {
      this.logger.debug("Creating Stripe customer", {
        email: request.email,
        name: request.name,
      });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.post<CreateCustomerResponse>(
          `${this.baseUrl}/customers`,
          request,
          { headers },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error("Failed to create Stripe customer", error);
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

  async getPayoutBalance(
    connectAccountId: string,
  ): Promise<PayoutBalanceResponse> {
    try {
      this.logger.debug("Retrieving payout balance", { connectAccountId });

      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.get<PayoutBalanceResponse>(
          `${this.baseUrl}/payouts/balance/${connectAccountId}`,
          { headers },
        ),
      );

      return response.data;
    } catch (error) {
      this.handleAxiosError("Failed to retrieve payout balance", error);
    }
  }
}
