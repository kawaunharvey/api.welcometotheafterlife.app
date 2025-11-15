import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { AxiosError, AxiosResponse } from "axios";

// ==================== Questionnaire Types ====================

export interface StartQuestionnaireRequest {
  userId: string;
  memorialId?: string;
  maxQuestions?: number;
}

export interface StartQuestionnaireResponse {
  sessionId: string;
  userId: string;
  memorialId?: string;
  maxQuestions: number;
  currentQuestionIndex: number;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionnaireSessionResponse {
  sessionId: string;
  userId: string;
  memorialId?: string;
  maxQuestions: number;
  currentQuestionIndex: number;
  isCompleted: boolean;
  answeredQuestions: number;
  progress: {
    answered: number;
    total: number;
    percentage: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CurrentQuestionResponse {
  sessionId: string;
  question: {
    id: string;
    text: string;
    type: string;
    category?: string;
    isRequired?: boolean;
    examples?: string[];
    placeholder?: string;
    followUpTrigger?: string;
  };
  questionIndex: number;
  isLastQuestion: boolean;
  canSkip: boolean;
}

export interface AnswerQuestionRequest {
  answer: string;
}

export interface AnswerQuestionResponse {
  sessionId: string;
  questionId: string;
  answer: string;
  nextQuestion?: {
    id: string;
    text: string;
    type: string;
    category?: string;
    isRequired?: boolean;
    examples?: string[];
    placeholder?: string;
  };
  isCompleted: boolean;
}

export interface FollowUpRequest {
  context?: string;
  previousAnswer?: string;
}

export interface FollowUpResponse {
  sessionId: string;
  followUpQuestions: Array<{
    id: string;
    text: string;
    type: string;
    category?: string;
    parentQuestionId: string;
  }>;
}

// ==================== Draft Types ====================

export interface GenerateDraftRequest {
  sessionId: string;
  tone?: "RESPECTFUL" | "WARM" | "CELEBRATORY" | "TRADITIONAL" | "MODERN";
  length?: "SHORT" | "MEDIUM" | "LONG";
  includePersonalDetails?: boolean;
  includeFamily?: boolean;
  includeCareer?: boolean;
  includeHobbies?: boolean;
  customInstructions?: string;
}

export interface GenerateDraftResponse {
  id: string;
  sessionId: string;
  content: string;
  title?: string;
  tone: string;
  length: string;
  status: "DRAFT" | "FINAL";
  metadata: {
    wordCount: number;
    generatedAt: string;
    estimatedReadingTime: number;
    tone: string;
    length: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RegenerateDraftRequest {
  draftId: string;
  tone?: "RESPECTFUL" | "WARM" | "CELEBRATORY" | "TRADITIONAL" | "MODERN";
  length?: "SHORT" | "MEDIUM" | "LONG";
  includePersonalDetails?: boolean;
  includeFamily?: boolean;
  includeCareer?: boolean;
  includeHobbies?: boolean;
  customInstructions?: string;
}

export interface GetDraftResponse {
  id: string;
  sessionId: string;
  content: string;
  title?: string;
  tone: string;
  length: string;
  status: "DRAFT" | "FINAL";
  metadata: {
    wordCount: number;
    generatedAt: string;
    estimatedReadingTime: number;
    tone: string;
    length: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EstimateCostRequest {
  sessionId: string;
  tone?: string;
  length?: string;
  includePersonalDetails?: boolean;
  includeFamily?: boolean;
  includeCareer?: boolean;
  includeHobbies?: boolean;
  customInstructions?: string;
}

export interface EstimateCostResponse {
  estimatedTokens: number;
  estimatedCost: number;
  currency: string;
  model: string;
  breakdown: {
    basePrompt: number;
    sessionData: number;
    customInstructions?: number;
  };
}

// ==================== Authentication Types ====================

export interface ClientInfo {
  clientId: string;
  scopes: string[];
  type: "client_credentials";
  issuedAt: number;
  expiresAt: number;
}

export interface ClientScopesResponse {
  clientId: string;
  scopes: string[];
  permissions: {
    draft: {
      read: boolean;
      write: boolean;
    };
    questionnaire: {
      read: boolean;
      write: boolean;
    };
  };
  isAdmin: boolean;
}

// ==================== Main Client Class ====================

type RequestFn<T> = () => Promise<AxiosResponse<T> | undefined>;

@Injectable()
export class ObituaryServiceClient {
  private readonly logger = new Logger("ObituaryServiceClient");
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly oauthTokenUrl: string;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      "OBITUARY_SERVICE_URL",
      "http://localhost:3020",
    );
    this.clientId = this.configService.get<string>("OBITUARY_CLIENT_ID", "");
    this.clientSecret = this.configService.get<string>(
      "OBITUARY_CLIENT_SECRET",
      "",
    );
    this.oauthTokenUrl = this.configService.get<string>(
      "OBITUARY_OAUTH_TOKEN_URL",
      "https://oauth.example.com/oauth2/token",
    );
  }

  // ==================== Authentication ====================

  /**
   * Get access token using OAuth2 client credentials flow
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
      const response = await this.httpService
        .post(
          this.oauthTokenUrl,
          new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.clientId,
            client_secret: this.clientSecret,
            scope:
              "draft:read draft:write questionnaire:read questionnaire:write",
          }),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        )
        .toPromise();

      if (!response?.data) {
        throw new Error("No response data from OAuth2 token endpoint");
      }

      this.accessToken = response.data.access_token;
      // Set expiration time (subtract 60 seconds for buffer)
      this.tokenExpiresAt =
        Date.now() + response.data.expires_in * 1000 - 60000;

      this.logger.log("Successfully obtained OAuth2 access token");
      return this.accessToken!;
    } catch (error) {
      this.logger.error("Failed to obtain OAuth2 access token", error);
      throw new Error("Failed to authenticate with obituary service");
    }
  }

  /**
   * Get current client information
   */
  async getClientInfo(): Promise<ClientInfo> {
    const headers = await this.getHeaders();
    return this.retryableRequest<ClientInfo>(
      () =>
        this.httpService
          .get<ClientInfo>(`${this.baseUrl}/auth/me`, headers)
          .toPromise(),
      "getClientInfo",
    );
  }

  /**
   * Get client scopes and permissions
   */
  async getClientScopes(): Promise<ClientScopesResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<ClientScopesResponse>(
      () =>
        this.httpService
          .get<ClientScopesResponse>(`${this.baseUrl}/auth/scopes`, headers)
          .toPromise(),
      "getClientScopes",
    );
  }

  // ==================== Questionnaire Methods ====================

  /**
   * Start a new questionnaire session
   */
  async startQuestionnaire(
    req: StartQuestionnaireRequest,
  ): Promise<StartQuestionnaireResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<StartQuestionnaireResponse>(
      () =>
        this.httpService
          .post<StartQuestionnaireResponse>(
            `${this.baseUrl}/questionnaire/start`,
            req,
            headers,
          )
          .toPromise(),
      "startQuestionnaire",
    );
  }

  /**
   * Get questionnaire session progress
   */
  async getQuestionnaireSession(
    sessionId: string,
  ): Promise<QuestionnaireSessionResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<QuestionnaireSessionResponse>(
      () =>
        this.httpService
          .get<QuestionnaireSessionResponse>(
            `${this.baseUrl}/questionnaire/${sessionId}`,
            headers,
          )
          .toPromise(),
      "getQuestionnaireSession",
    );
  }

  /**
   * Get current question in the questionnaire
   */
  async getCurrentQuestion(
    sessionId: string,
  ): Promise<CurrentQuestionResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<CurrentQuestionResponse>(
      () =>
        this.httpService
          .get<CurrentQuestionResponse>(
            `${this.baseUrl}/questionnaire/${sessionId}/current`,
            headers,
          )
          .toPromise(),
      "getCurrentQuestion",
    );
  }

  /**
   * Answer a question in the questionnaire
   */
  async answerQuestion(
    sessionId: string,
    req: AnswerQuestionRequest,
  ): Promise<AnswerQuestionResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<AnswerQuestionResponse>(
      () =>
        this.httpService
          .post<AnswerQuestionResponse>(
            `${this.baseUrl}/questionnaire/${sessionId}/answer`,
            req,
            headers,
          )
          .toPromise(),
      "answerQuestion",
    );
  }

  /**
   * Skip a question in the questionnaire
   */
  async skipQuestion(sessionId: string): Promise<AnswerQuestionResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<AnswerQuestionResponse>(
      () =>
        this.httpService
          .post<AnswerQuestionResponse>(
            `${this.baseUrl}/questionnaire/${sessionId}/skip`,
            {},
            headers,
          )
          .toPromise(),
      "skipQuestion",
    );
  }

  /**
   * Generate follow-up questions
   */
  async generateFollowUp(
    sessionId: string,
    req: FollowUpRequest,
  ): Promise<FollowUpResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<FollowUpResponse>(
      () =>
        this.httpService
          .post<FollowUpResponse>(
            `${this.baseUrl}/questionnaire/${sessionId}/followup`,
            req,
            headers,
          )
          .toPromise(),
      "generateFollowUp",
    );
  }

  // ==================== Draft Methods ====================

  /**
   * Generate obituary draft from session answers
   */
  async generateDraft(
    req: GenerateDraftRequest,
  ): Promise<GenerateDraftResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<GenerateDraftResponse>(
      () =>
        this.httpService
          .post<GenerateDraftResponse>(
            `${this.baseUrl}/draft/generate`,
            req,
            headers,
          )
          .toPromise(),
      "generateDraft",
    );
  }

  /**
   * Regenerate an existing draft with different parameters
   */
  async regenerateDraft(
    req: RegenerateDraftRequest,
  ): Promise<GenerateDraftResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<GenerateDraftResponse>(
      () =>
        this.httpService
          .post<GenerateDraftResponse>(
            `${this.baseUrl}/draft/regenerate`,
            req,
            headers,
          )
          .toPromise(),
      "regenerateDraft",
    );
  }

  /**
   * Get specific draft by ID
   */
  async getDraft(draftId: string): Promise<GetDraftResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<GetDraftResponse>(
      () =>
        this.httpService
          .get<GetDraftResponse>(`${this.baseUrl}/draft/${draftId}`, headers)
          .toPromise(),
      "getDraft",
    );
  }

  /**
   * Get all drafts for a session
   */
  async getSessionDrafts(sessionId: string): Promise<GetDraftResponse[]> {
    const headers = await this.getHeaders();
    return this.retryableRequest<GetDraftResponse[]>(
      () =>
        this.httpService
          .get<GetDraftResponse[]>(
            `${this.baseUrl}/draft/session/${sessionId}`,
            headers,
          )
          .toPromise(),
      "getSessionDrafts",
    );
  }

  /**
   * Get latest draft for a session
   */
  async getLatestDraft(sessionId: string): Promise<GetDraftResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<GetDraftResponse>(
      () =>
        this.httpService
          .get<GetDraftResponse>(
            `${this.baseUrl}/draft/session/${sessionId}/latest`,
            headers,
          )
          .toPromise(),
      "getLatestDraft",
    );
  }

  /**
   * Estimate cost for draft generation
   */
  async estimateCost(req: EstimateCostRequest): Promise<EstimateCostResponse> {
    const headers = await this.getHeaders();
    return this.retryableRequest<EstimateCostResponse>(
      () =>
        this.httpService
          .post<EstimateCostResponse>(
            `${this.baseUrl}/draft/estimate-cost`,
            req,
            headers,
          )
          .toPromise(),
      "estimateCost",
    );
  }

  // ==================== Helper Methods ====================

  /**
   * Generic retryable HTTP request with exponential backoff.
   */
  private async retryableRequest<T>(
    fn: RequestFn<T>,
    label: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fn();
        if (!response) {
          throw new Error("No response from request");
        }
        return response.data;
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;

        // Don't retry on 4xx errors (client errors), except 401 (auth errors)
        if (axiosError.response && axiosError.response.status < 500) {
          if (axiosError.response.status === 401) {
            // Clear token and retry once for auth errors
            this.accessToken = null;
            this.tokenExpiresAt = null;
            if (attempt === 0) {
              this.logger.warn(
                `[${label}] Auth error, clearing token and retrying`,
              );
              continue;
            }
          }

          this.logger.error(
            `[${label}] Client error: ${axiosError.response.status}`,
            axiosError.response.data,
          );
          throw error;
        }

        // For 5xx or network errors, retry with backoff
        if (attempt < this.maxRetries - 1) {
          const delayMs = this.retryDelayMs * 2 ** attempt;
          this.logger.warn(
            `[${label}] Attempt ${attempt + 1} failed; retrying in ${delayMs}ms`,
            lastError.message,
          );
          await this.delay(delayMs);
        }
      }
    }

    this.logger.error(
      `[${label}] Failed after ${this.maxRetries} attempts`,
      lastError,
    );
    throw lastError || new Error(`Request failed: ${label}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async getHeaders() {
    const token = await this.getAccessToken();
    return {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    };
  }
}
