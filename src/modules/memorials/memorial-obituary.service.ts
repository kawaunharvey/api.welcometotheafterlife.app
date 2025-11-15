import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  ObituaryServiceClient,
  StartQuestionnaireRequest,
  GenerateDraftRequest,
  GetDraftResponse,
} from "../../common";
import { ObituaryCacheService } from "../../common";
import { MemorialsService } from "./memorials.service";

@Injectable()
export class MemorialObituaryService {
  private readonly logger = new Logger(MemorialObituaryService.name);

  constructor(
    private readonly obituaryClient: ObituaryServiceClient,
    private readonly obituaryCache: ObituaryCacheService,
    private readonly memorialsService: MemorialsService,
  ) {}

  // ==================== Questionnaire Management ====================

  /**
   * Start a new questionnaire session for a memorial
   */
  async startQuestionnaire(
    memorialId: string,
    userId: string,
    maxQuestions?: number,
  ) {
    this.logger.debug(
      `Starting questionnaire for memorial ${memorialId} by user ${userId}`,
    );

    // Verify memorial exists and user has access
    const memorial = await this.memorialsService.getById(memorialId, userId);
    if (!memorial) {
      throw new NotFoundException(
        `Memorial ${memorialId} not found or access denied`,
      );
    }

    // Check if there's already an active session cached
    const existingSessionId =
      await this.obituaryCache.getCachedMemorialSession(memorialId);
    if (existingSessionId) {
      const existingSession =
        await this.obituaryCache.getCachedQuestionnaireSession(
          existingSessionId,
        );
      if (existingSession && !existingSession.isCompleted) {
        this.logger.debug(
          `Returning existing active session ${existingSessionId} for memorial ${memorialId}`,
        );
        return existingSession;
      }
    }

    // Start new questionnaire session
    const request: StartQuestionnaireRequest = {
      userId,
      memorialId,
      maxQuestions: maxQuestions || 15,
    };

    const session = await this.obituaryClient.startQuestionnaire(request);

    // Cache the session and memorial association
    await Promise.all([
      // Convert to QuestionnaireSessionResponse format for caching
      this.obituaryCache.cacheQuestionnaireSession({
        ...session,
        answeredQuestions: 0,
        progress: {
          answered: 0,
          total: session.maxQuestions,
          percentage: 0,
        },
      }),
      this.obituaryCache.cacheMemorialSession(memorialId, session.sessionId),
    ]);

    // Update memorial with session ID
    await this.memorialsService.updateObituarySession(
      memorialId,
      session.sessionId,
    );

    this.logger.log(
      `Started questionnaire session ${session.sessionId} for memorial ${memorialId}`,
    );
    return session;
  }

  /**
   * Get questionnaire session progress
   */
  async getQuestionnaireSession(sessionId: string) {
    // Try cache first
    let session =
      await this.obituaryCache.getCachedQuestionnaireSession(sessionId);

    if (!session) {
      // Fetch from API if not in cache
      session = await this.obituaryClient.getQuestionnaireSession(sessionId);
      if (session) {
        await this.obituaryCache.cacheQuestionnaireSession(session);
      }
    }

    if (!session) {
      throw new NotFoundException(
        `Questionnaire session ${sessionId} not found`,
      );
    }

    return session;
  }

  /**
   * Get current question in the questionnaire
   */
  async getCurrentQuestion(sessionId: string) {
    // Try cache first
    let question = await this.obituaryCache.getCachedCurrentQuestion(sessionId);

    if (!question) {
      // Fetch from API if not in cache
      question = await this.obituaryClient.getCurrentQuestion(sessionId);
      if (question) {
        await this.obituaryCache.cacheCurrentQuestion(sessionId, question);
      }
    }

    if (!question) {
      throw new NotFoundException(
        `Current question for session ${sessionId} not found`,
      );
    }

    return question;
  }

  /**
   * Answer a question in the questionnaire
   */
  async answerQuestion(sessionId: string, answer: string) {
    const response = await this.obituaryClient.answerQuestion(sessionId, {
      answer,
    });

    // Invalidate current question cache since it changed
    await this.obituaryCache.invalidateOnSessionCompletion(sessionId);

    // If session is completed, cache the final session state
    if (response.isCompleted) {
      const finalSession =
        await this.obituaryClient.getQuestionnaireSession(sessionId);
      await this.obituaryCache.cacheQuestionnaireSession(finalSession);
      this.logger.log(`Questionnaire session ${sessionId} completed`);
    }

    return response;
  }

  /**
   * Skip a question in the questionnaire
   */
  async skipQuestion(sessionId: string) {
    const response = await this.obituaryClient.skipQuestion(sessionId);

    // Invalidate current question cache since it changed
    await this.obituaryCache.invalidateOnSessionCompletion(sessionId);

    // If session is completed, cache the final session state
    if (response.isCompleted) {
      const finalSession =
        await this.obituaryClient.getQuestionnaireSession(sessionId);
      await this.obituaryCache.cacheQuestionnaireSession(finalSession);
      this.logger.log(`Questionnaire session ${sessionId} completed`);
    }

    return response;
  }

  /**
   * Generate follow-up questions
   */
  async generateFollowUp(
    sessionId: string,
    context?: string,
    previousAnswer?: string,
  ) {
    const response = await this.obituaryClient.generateFollowUp(sessionId, {
      context,
      previousAnswer,
    });

    return response;
  }

  // ==================== Draft Management ====================

  /**
   * Generate obituary draft from session answers
   */
  async generateDraft(
    sessionId: string,
    options?: {
      tone?: "RESPECTFUL" | "WARM" | "CELEBRATORY" | "TRADITIONAL" | "MODERN";
      length?: "SHORT" | "MEDIUM" | "LONG";
      includePersonalDetails?: boolean;
      includeFamily?: boolean;
      includeCareer?: boolean;
      includeHobbies?: boolean;
      customInstructions?: string;
    },
  ) {
    this.logger.debug(`Generating draft for session ${sessionId}`);

    const request: GenerateDraftRequest = {
      sessionId,
      tone: options?.tone,
      length: options?.length,
      includePersonalDetails: options?.includePersonalDetails,
      includeFamily: options?.includeFamily,
      includeCareer: options?.includeCareer,
      includeHobbies: options?.includeHobbies,
      customInstructions: options?.customInstructions,
    };

    const draft = await this.obituaryClient.generateDraft(request);

    // Cache the draft and update latest draft cache
    await Promise.all([
      this.obituaryCache.cacheLatestDraft(sessionId, draft),
      this.obituaryCache.invalidateOnNewDraft(sessionId),
    ]);

    // Update memorial with obituary ID if it's the first draft
    const session = await this.getQuestionnaireSession(sessionId);
    if (session.memorialId) {
      await this.memorialsService.updateObituaryId(
        session.memorialId,
        draft.id,
      );
      await this.obituaryCache.cacheMemorialObituary(
        session.memorialId,
        draft.id,
      );
    }

    this.logger.log(`Generated draft ${draft.id} for session ${sessionId}`);
    return draft;
  }

  /**
   * Regenerate an existing draft with different parameters
   */
  async regenerateDraft(
    draftId: string,
    options?: {
      tone?: "RESPECTFUL" | "WARM" | "CELEBRATORY" | "TRADITIONAL" | "MODERN";
      length?: "SHORT" | "MEDIUM" | "LONG";
      includePersonalDetails?: boolean;
      includeFamily?: boolean;
      includeCareer?: boolean;
      includeHobbies?: boolean;
      customInstructions?: string;
    },
  ) {
    this.logger.debug(`Regenerating draft ${draftId}`);

    const draft = await this.obituaryClient.regenerateDraft({
      draftId,
      tone: options?.tone,
      length: options?.length,
      includePersonalDetails: options?.includePersonalDetails,
      includeFamily: options?.includeFamily,
      includeCareer: options?.includeCareer,
      includeHobbies: options?.includeHobbies,
      customInstructions: options?.customInstructions,
    });

    // Cache the updated draft and clear related caches
    await Promise.all([
      this.obituaryCache.cacheLatestDraft(draft.sessionId, draft),
      this.obituaryCache.invalidateOnNewDraft(draft.sessionId),
    ]);

    this.logger.log(`Regenerated draft ${draft.id}`);
    return draft;
  }

  /**
   * Get specific draft by ID
   */
  async getDraft(draftId: string): Promise<GetDraftResponse> {
    // Try cache first
    let draft = await this.obituaryCache.getCachedDraft(draftId);

    if (!draft) {
      // Fetch from API if not in cache
      draft = await this.obituaryClient.getDraft(draftId);
      if (draft) {
        await this.obituaryCache.cacheDraft(draft);
      }
    }

    if (!draft) {
      throw new NotFoundException(`Draft ${draftId} not found`);
    }

    return draft;
  }

  /**
   * Get all drafts for a session
   */
  async getSessionDrafts(sessionId: string): Promise<GetDraftResponse[]> {
    // Try cache first
    let drafts = await this.obituaryCache.getCachedSessionDrafts(sessionId);

    if (!drafts) {
      // Fetch from API if not in cache
      drafts = await this.obituaryClient.getSessionDrafts(sessionId);
      if (drafts) {
        await this.obituaryCache.cacheSessionDrafts(sessionId, drafts);
      }
    }

    return drafts || [];
  }

  /**
   * Get latest draft for a session
   */
  async getLatestDraft(sessionId: string): Promise<GetDraftResponse | null> {
    // Try cache first
    let draft = await this.obituaryCache.getCachedLatestDraft(sessionId);

    if (!draft) {
      try {
        // Fetch from API if not in cache
        draft = await this.obituaryClient.getLatestDraft(sessionId);
        if (draft) {
          await this.obituaryCache.cacheLatestDraft(sessionId, draft);
        }
      } catch (error) {
        // If no draft exists, return null instead of throwing
        if (
          error instanceof NotFoundException ||
          (error &&
            typeof error === "object" &&
            "response" in error &&
            (error as { response: { status: number } }).response?.status ===
              404)
        ) {
          return null;
        }
        throw error;
      }
    }

    return draft;
  }

  /**
   * Get latest draft for a memorial by its obituary ID
   */
  async getMemorialObituary(
    memorialId: string,
  ): Promise<GetDraftResponse | null> {
    // Try to get obituary ID from cache first
    let obituaryId =
      await this.obituaryCache.getCachedMemorialObituary(memorialId);

    if (!obituaryId) {
      // Get from memorial record if not cached
      const memorial = await this.memorialsService.findOne(memorialId);
      obituaryId = memorial?.obituaryId || null;

      if (obituaryId) {
        await this.obituaryCache.cacheMemorialObituary(memorialId, obituaryId);
      }
    }

    if (!obituaryId) {
      return null;
    }

    return this.getDraft(obituaryId);
  }

  /**
   * Estimate cost for draft generation
   */
  async estimateCost(
    sessionId: string,
    options?: {
      tone?: string;
      length?: string;
      includePersonalDetails?: boolean;
      includeFamily?: boolean;
      includeCareer?: boolean;
      includeHobbies?: boolean;
      customInstructions?: string;
    },
  ) {
    return this.obituaryClient.estimateCost({
      sessionId,
      tone: options?.tone,
      length: options?.length,
      includePersonalDetails: options?.includePersonalDetails,
      includeFamily: options?.includeFamily,
      includeCareer: options?.includeCareer,
      includeHobbies: options?.includeHobbies,
      customInstructions: options?.customInstructions,
    });
  }

  // ==================== Cache Management ====================

  /**
   * Clear all cached data for a memorial
   */
  async clearMemorialCache(memorialId: string): Promise<void> {
    await this.obituaryCache.invalidateMemorial(memorialId);
    this.logger.debug(`Cleared obituary cache for memorial ${memorialId}`);
  }

  /**
   * Clear all cached data for a session
   */
  async clearSessionCache(sessionId: string): Promise<void> {
    await this.obituaryCache.invalidateSession(sessionId);
    this.logger.debug(`Cleared obituary cache for session ${sessionId}`);
  }
}
