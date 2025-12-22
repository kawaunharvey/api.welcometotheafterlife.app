import { HttpService } from "@nestjs/axios";
import { HttpException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";

export interface UnderworldLocation {
  id: string;
  label?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isPrimary: boolean;
  source: "claimed" | "snapshot" | "location";
  distanceKm?: number;
}

export interface UnderworldServiceSummary {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  isUrgentCapable: boolean;
}

export interface UnderworldBusiness {
  id: string;
  displayName: string;
  displayDescription?: string | null;
  displayPhone?: string | null;
  displayWebsite?: string | null;
  displayAddress?: string | null;
  categories: string[];
  tags: string[];
  isActive: boolean;
  locations: UnderworldLocation[];
  services?: UnderworldServiceSummary[];
  subscriptionEligibleForLeads?: boolean;
}

export interface ListBusinessesQuery {
  category?: string;
  categories?: string[];
  nearLat?: number;
  nearLng?: number;
  radiusKm?: number;
  limit?: number;
  includeServices?: boolean;
}

export interface ListBusinessesResponse {
  items: UnderworldBusiness[];
  count: number;
}

export type UnderworldOwnerStatus =
  | "IN_REVIEW"
  | "ACCEPTED"
  | "REJECTED"
  | "FULFILLED"
  | "CANCELLED";

export interface ServiceRequestBusinessLite {
  id: string;
  claimedName?: string | null;
  name?: string | null;
  googleSnapshot?: {
    name?: string | null;
  } | null;
}

export interface ServiceRequest {
  id: string;
  businessId?: string | null;
  requesterUserId: string;
  requesterContact?: string | null;
  targetCategory?: string | null;
  title?: string | null;
  description: string;
  budgetMinCents?: number | null;
  budgetMaxCents?: number | null;
  isUrgent?: boolean | null;
  locationCity?: string | null;
  locationState?: string | null;
  locationPostalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  respondedAt?: string | null;
  closedAt?: string | null;
  business?: ServiceRequestBusinessLite | null;
}

export interface CreateServiceRequestInput {
  businessId?: string;
  targetCategory?: string;
  title?: string;
  description: string;
  budgetMinCents?: number;
  budgetMaxCents?: number;
  isUrgent?: boolean;
  locationCity?: string;
  locationState?: string;
  locationPostalCode?: string;
  latitude?: number;
  longitude?: number;
  requesterContact?: string;
}

export interface UpdateServiceRequestStatusInput {
  status: UnderworldOwnerStatus;
  notes?: string;
}

interface HeaderOptions {
  userId?: string;
  adminUserId?: string;
  idempotencyKey?: string;
}

@Injectable()
export class UnderworldServiceClient {
  private readonly logger = new Logger("UnderworldServiceClient");
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly serviceLoginPath: string;

  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private authDisabled = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>("UNDERWORLD_SERVICE_API_URL") ||
      "http://localhost:3000";
    this.apiKey =
      this.configService.get<string>("UNDERWORLD_SERVICE_API_KEY") || "";
    this.secretKey =
      this.configService.get<string>("UNDERWORLD_SERVICE_SECRET_KEY") || "";
    this.serviceLoginPath =
      this.configService.get<string>("UNDERWORLD_SERVICE_LOGIN_PATH") ||
      "/auth/service-login";
  }

  private handleAxiosError(context: string, error: unknown): never {
    const axiosError = error as AxiosError;
    if (axiosError?.isAxiosError) {
      const status = axiosError.response?.status ?? 500;
      const data = axiosError.response?.data;

      this.logger.error(`${context} (underworld)`, {
        status,
        data,
        message: axiosError.message,
        url: axiosError.config?.url,
        method: axiosError.config?.method,
        responseHeaders: axiosError.response?.headers,
      });

      throw new HttpException(data || axiosError.message, status);
    }

    this.logger.error(`${context} (unknown error)`, error as Error);
    throw error;
  }

  /**
   * Attempt to fetch a bearer token using service key auth.
   * We allow a graceful fallback to unauthenticated calls while
   * the underworld service finishes exposing the service login endpoint.
   */
  private async getAccessToken(): Promise<string | null> {
    if (this.authDisabled) {
      return null;
    }

    if (
      this.accessToken &&
      this.tokenExpiresAt &&
      Date.now() < this.tokenExpiresAt
    ) {
      return this.accessToken;
    }

    if (!this.apiKey || !this.secretKey) {
      this.authDisabled = true;
      this.logger.warn(
        "UNDERWORLD_SERVICE_API_KEY or SECRET_KEY missing; proceeding without Authorization header",
      );
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}${this.serviceLoginPath}`,
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

      if (!response?.data?.access_token) {
        throw new Error("No access_token in underworld auth response");
      }

      this.accessToken = response.data.access_token;
      const expiresInSeconds = response.data.expires_in ?? 3600;
      this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000 - 60000;
      return this.accessToken;
    } catch (error) {
      this.authDisabled = true;
      this.logger.warn(
        "Underworld service auth handshake failed; continuing without Authorization header",
        (error as Error).message,
      );
      return null;
    }
  }

  private async getHeaders(options: HeaderOptions = {}) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (options.userId) {
      headers["x-user-id"] = options.userId;
    }

    if (options.adminUserId) {
      headers["x-admin-user-id"] = options.adminUserId;
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const token = await this.getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  async listBusinesses(
    query: ListBusinessesQuery = {},
  ): Promise<ListBusinessesResponse> {
    try {
      const headers = await this.getHeaders();
      const categoriesCsv = query.categories?.length
        ? query.categories.join(",")
        : undefined;
      const finalParams: Record<string, unknown> = {
        ...query,
        categoriesCsv,
      };
      // Avoid axios array serialization quirks by dropping categories array here
      delete (finalParams as Record<string, unknown>).categories;
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/businesses`, {
          params: finalParams,
          headers,
        }),
      );

      return response.data as ListBusinessesResponse;
    } catch (error) {
      return this.handleAxiosError("listBusinesses", error);
    }
  }

  async getBusinessProfile(businessId: string): Promise<UnderworldBusiness> {
    try {
      const headers = await this.getHeaders();
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/businesses/${businessId}`, {
          headers,
        }),
      );

      return response.data as UnderworldBusiness;
    } catch (error) {
      return this.handleAxiosError("getBusinessProfile", error);
    }
  }

  async createServiceRequest(
    requesterUserId: string,
    payload: CreateServiceRequestInput,
  ): Promise<ServiceRequest> {
    try {
      const headers = await this.getHeaders({ userId: requesterUserId });
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/service-requests`, payload, {
          headers,
        }),
      );

      return response.data as ServiceRequest;
    } catch (error) {
      return this.handleAxiosError("createServiceRequest", error);
    }
  }

  async listMyServiceRequests(userId: string): Promise<ServiceRequest[]> {
    try {
      const headers = await this.getHeaders({ userId });
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/service-requests/mine`, {
          headers,
        }),
      );

      return response.data as ServiceRequest[];
    } catch (error) {
      return this.handleAxiosError("listMyServiceRequests", error);
    }
  }

  async withdrawServiceRequest(
    userId: string,
    requestId: string,
  ): Promise<ServiceRequest> {
    try {
      const headers = await this.getHeaders({ userId });
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/service-requests/${requestId}/withdraw`,
          {},
          {
            headers,
          },
        ),
      );

      return response.data as ServiceRequest;
    } catch (error) {
      return this.handleAxiosError("withdrawServiceRequest", error);
    }
  }

  async listServiceRequestsForBusiness(
    businessId: string,
    ownerUserId: string,
    status?: string,
  ): Promise<ServiceRequest[]> {
    try {
      const headers = await this.getHeaders({ userId: ownerUserId });
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/businesses/${businessId}/requests`,
          {
            headers,
            params: status ? { status } : undefined,
          },
        ),
      );

      return response.data as ServiceRequest[];
    } catch (error) {
      return this.handleAxiosError("listServiceRequestsForBusiness", error);
    }
  }

  async updateServiceRequestStatus(
    businessId: string,
    requestId: string,
    ownerUserId: string,
    payload: UpdateServiceRequestStatusInput,
  ): Promise<ServiceRequest> {
    try {
      const headers = await this.getHeaders({ userId: ownerUserId });
      const response = await firstValueFrom(
        this.httpService.patch(
          `${this.baseUrl}/businesses/${businessId}/requests/${requestId}/status`,
          payload,
          {
            headers,
          },
        ),
      );

      return response.data as ServiceRequest;
    } catch (error) {
      return this.handleAxiosError("updateServiceRequestStatus", error);
    }
  }
}
