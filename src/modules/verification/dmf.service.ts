import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance, AxiosResponse } from "axios";

interface DMFTokenResponse {
  access: string;
  refresh: string;
}

interface DMFTokenRefreshResponse {
  access: string;
}

interface DMFTokenValidateResponse {
  token: string;
  user_id: number;
  username: string;
  expires_at: string;
}

interface DMFSearchRequest {
  ssn?: string;
  firstname?: string;
  lastname?: string;
  dateofbirth?: string; // MMDDYYYY
  dateofdeath?: string; // MMDDYYYY
  yearofbirth?: string; // YYYY
  yearofdeath?: string; // YYYY
  webhook_urls?: string[];
}

interface DMFSearchResult {
  id: number;
  ssn: string;
  fullname: string;
  dateofbirth: string; // MM-DD-YYYY
  dateofdeath: string; // MM-DD-YYYY
}

interface DMFSearchResponse {
  success_message?: string;
  data?: {
    id: number;
    created_by: string;
    source: string;
    status: string;
    created_at: string;
    updated_at: string;
    request_data: DMFSearchRequest;
    results: DMFSearchResult[];
  };
  success: boolean;
  pagination?: {
    page?: number;
    page_size?: number;
    total_pages?: number;
    total_count?: number;
  };
  code?: string;
  message?: string;
}

@Injectable()
export class DmfService {
  private readonly logger = new Logger(DmfService.name);
  private readonly httpClient: AxiosInstance;

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  private readonly baseUrl: string;
  private readonly authUrl: string;
  private readonly refreshUrl: string;
  private readonly validateUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>("DMF_BASE_URL") || "";
    this.authUrl = this.configService.get<string>("DMF_AUTH_URL") || "";
    this.refreshUrl = this.configService.get<string>("DMF_REFRESH_URL") || "";
    this.validateUrl = this.configService.get<string>("DMF_VALIDATE_URL") || "";
    this.username = this.configService.get<string>("DMF_USERNAME") || "";
    this.password = this.configService.get<string>("DMF_PASSWORD") || "";
    this.timeoutMs = Number.parseInt(
      this.configService.get<string>("DMF_TIMEOUT_MS") || "8000",
      10,
    );

    this.httpClient = axios.create({
      timeout: this.timeoutMs,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor to automatically add auth header
    this.httpClient.interceptors.request.use(async (config) => {
      await this.ensureValidToken();
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Add response interceptor to handle token expiration
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.refreshToken) {
          try {
            await this.refreshAccessToken();
            // Retry the original request
            const originalRequest = error.config;
            originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
            return this.httpClient(originalRequest);
          } catch (refreshError) {
            this.logger.error("Failed to refresh DMF token", {
              error: refreshError,
            });
            this.clearTokens();
            throw error;
          }
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * Authenticate with DMF and get access/refresh tokens
   */
  private async authenticate(): Promise<void> {
    try {
      this.logger.debug("Authenticating with DMF service");

      const response: AxiosResponse<DMFTokenResponse> = await axios.post(
        this.authUrl,
        {
          username: this.username,
          password: this.password,
        },
        {
          timeout: this.timeoutMs,
          headers: { "Content-Type": "application/json" },
        },
      );

      this.accessToken = response.data.access;
      this.refreshToken = response.data.refresh;

      // Access token is valid for 1 hour, refresh token for 24 hours
      this.tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000); // 55 minutes buffer

      this.logger.debug("DMF authentication successful");
    } catch (error) {
      this.logger.error("DMF authentication failed", {
        error: error.response?.data || error.message,
      });
      throw new Error(`DMF authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    try {
      this.logger.debug("Refreshing DMF access token");

      const response: AxiosResponse<DMFTokenRefreshResponse> = await axios.post(
        this.refreshUrl,
        {
          refresh: this.refreshToken,
        },
        {
          timeout: this.timeoutMs,
          headers: { "Content-Type": "application/json" },
        },
      );

      this.accessToken = response.data.access;
      this.tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000); // 55 minutes buffer

      this.logger.debug("DMF token refresh successful");
    } catch (error) {
      this.logger.error("DMF token refresh failed", {
        error: error.response?.data || error.message,
      });
      throw new Error(`DMF token refresh failed: ${error.message}`);
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureValidToken(): Promise<void> {
    const now = new Date();

    if (
      !this.accessToken ||
      !this.tokenExpiresAt ||
      now >= this.tokenExpiresAt
    ) {
      if (this.refreshToken) {
        try {
          await this.refreshAccessToken();
          return;
        } catch (error) {
          this.logger.warn(
            "Token refresh failed, falling back to full authentication",
          );
        }
      }

      await this.authenticate();
    }
  }

  /**
   * Clear stored tokens
   */
  private clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
  }

  /**
   * Validate current token
   */
  async validateToken(): Promise<DMFTokenValidateResponse | null> {
    if (!this.accessToken) {
      return null;
    }

    try {
      const response: AxiosResponse<DMFTokenValidateResponse> =
        await axios.post(
          this.validateUrl,
          {
            token: this.accessToken,
          },
          {
            timeout: this.timeoutMs,
            headers: { "Content-Type": "application/json" },
          },
        );

      return response.data;
    } catch (error) {
      this.logger.error("DMF token validation failed", {
        error: error.response?.data || error.message,
      });
      return null;
    }
  }

  /**
   * Submit a DMF search request
   */
  async submitSearch(
    searchRequest: DMFSearchRequest,
  ): Promise<DMFSearchResponse> {
    try {
      this.logger.debug("Submitting DMF search", {
        hasSSN: !!searchRequest.ssn,
        firstname: searchRequest.firstname,
        lastname: searchRequest.lastname,
      });

      const response: AxiosResponse<DMFSearchResponse> =
        await this.httpClient.post(this.baseUrl, searchRequest);

      // Check for credit limit error
      if (response.data.code === "credit_message") {
        this.logger.warn("DMF credit limit reached", {
          message: response.data.message,
        });
        return {
          success: false,
          code: response.data.code,
          message: response.data.message,
        };
      }

      this.logger.debug("DMF search submitted successfully", {
        submissionId: response.data.data?.id,
      });

      return response.data;
    } catch (error) {
      this.logger.error("DMF search submission failed", {
        error: error.response?.data || error.message,
      });

      if (error.response?.status === 429) {
        return {
          success: false,
          code: "rate_limit_exceeded",
          message:
            "DMF API rate limit exceeded. Please try again in 10 minutes.",
        };
      }

      throw new Error(`DMF search failed: ${error.message}`);
    }
  }

  /**
   * Retrieve DMF search results by submission ID
   */
  async getSearchResults(submissionId: number): Promise<DMFSearchResponse> {
    try {
      this.logger.debug("Retrieving DMF search results", { submissionId });

      const response: AxiosResponse<DMFSearchResponse> =
        await this.httpClient.get(`${this.baseUrl}?id=${submissionId}`);

      this.logger.debug("DMF search results retrieved successfully", {
        submissionId,
        resultCount: response.data.data?.results?.length || 0,
      });

      return response.data;
    } catch (error) {
      this.logger.error("DMF search results retrieval failed", {
        submissionId,
        error: error.response?.data || error.message,
      });

      throw new Error(`DMF search results retrieval failed: ${error.message}`);
    }
  }

  /**
   * Calculate match score between search input and DMF result
   */
  calculateMatchScore(
    searchInput: {
      fullName: string;
      dateOfBirth?: Date;
      dateOfPassing?: Date;
    },
    dmfResult: DMFSearchResult,
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    // Name matching (weight: 40%)
    const nameWeight = 0.4;
    const nameScore = this.calculateNameSimilarity(
      searchInput.fullName,
      dmfResult.fullname,
    );
    totalScore += nameScore * nameWeight;
    totalWeight += nameWeight;

    // Date of birth matching (weight: 30%)
    if (searchInput.dateOfBirth && dmfResult.dateofbirth) {
      const dobWeight = 0.3;
      const dobScore = this.calculateDateSimilarity(
        searchInput.dateOfBirth,
        this.parseDmfDate(dmfResult.dateofbirth),
      );
      totalScore += dobScore * dobWeight;
      totalWeight += dobWeight;
    }

    // Date of death matching (weight: 30%)
    if (searchInput.dateOfPassing && dmfResult.dateofdeath) {
      const dodWeight = 0.3;
      const dodScore = this.calculateDateSimilarity(
        searchInput.dateOfPassing,
        this.parseDmfDate(dmfResult.dateofdeath),
      );
      totalScore += dodScore * dodWeight;
      totalWeight += dodWeight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Calculate name similarity using simple normalized matching
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const normalize = (name: string) =>
      name
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .trim()
        .replace(/\s+/g, " ");

    const n1 = normalize(name1);
    const n2 = normalize(name2);

    if (n1 === n2) return 1;

    // Simple word-based matching
    const words1 = n1.split(" ");
    const words2 = n2.split(" ");

    let matches = 0;
    for (const word1 of words1) {
      if (words2.some((word2) => word1 === word2)) {
        matches++;
      }
    }

    const maxWords = Math.max(words1.length, words2.length);
    return maxWords > 0 ? matches / maxWords : 0;
  }

  /**
   * Calculate date similarity
   */
  private calculateDateSimilarity(date1: Date, date2: Date): number {
    const diffMs = Math.abs(date1.getTime() - date2.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays === 0) return 1;
    if (diffDays <= 1) return 0.9;
    if (diffDays <= 7) return 0.7;
    if (diffDays <= 30) return 0.5;
    if (diffDays <= 365) return 0.3;

    return 0;
  }

  /**
   * Parse DMF date format (MM-DD-YYYY) to Date object
   */
  private parseDmfDate(dmfDate: string): Date {
    const [month, day, year] = dmfDate
      .split("-")
      .map((s) => Number.parseInt(s, 10));
    return new Date(year, month - 1, day);
  }

  /**
   * Format date for DMF API (MMDDYYYY)
   */
  formatDateForDmf(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const year = date.getFullYear().toString();
    return `${month}${day}${year}`;
  }

  /**
   * Format year for DMF API (YYYY)
   */
  formatYearForDmf(date: Date): string {
    return date.getFullYear().toString();
  }
}
