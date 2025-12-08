import { Injectable, Logger } from "@nestjs/common";
import { CacheService } from "./cache.service";
import {
  GenerateDraftResponse,
  GetDraftResponse,
  QuestionnaireSessionResponse,
  CurrentQuestionResponse,
} from "../http-client/obituary-service.client";

export interface ObituaryCacheKeys {
  // Draft cache keys
  DRAFT_BY_ID: (draftId: string) => string;
  LATEST_DRAFT_BY_SESSION: (sessionId: string) => string;
  SESSION_DRAFTS: (sessionId: string) => string;

  // Questionnaire cache keys
  QUESTIONNAIRE_SESSION: (sessionId: string) => string;
  CURRENT_QUESTION: (sessionId: string) => string;

  // Memorial-specific cache
  MEMORIAL_OBITUARY: (memorialId: string) => string;
  MEMORIAL_SESSION: (memorialId: string) => string;
}

@Injectable()
export class ObituaryCacheService {
  private readonly logger = new Logger(ObituaryCacheService.name);

  // Cache TTL configurations (in seconds)
  private readonly CACHE_TTL = {
    DRAFT: 24 * 60 * 60, // 24 hours - drafts are relatively stable
    LATEST_DRAFT: 2 * 60 * 60, // 2 hours - may change as new drafts are created
    SESSION_DRAFTS: 30 * 60, // 30 minutes - list may change frequently
    QUESTIONNAIRE_SESSION: 60 * 60, // 1 hour - session state changes moderately
    CURRENT_QUESTION: 10 * 60, // 10 minutes - changes as questions are answered
    MEMORIAL_OBITUARY: 6 * 60 * 60, // 6 hours - memorial obituary association
    MEMORIAL_SESSION: 6 * 60 * 60, // 6 hours - memorial session association
  } as const;

  // Cache key generators
  public readonly KEYS: ObituaryCacheKeys = {
    DRAFT_BY_ID: (draftId: string) => `obituary:draft:${draftId}`,
    LATEST_DRAFT_BY_SESSION: (sessionId: string) =>
      `obituary:session:${sessionId}:latest-draft`,
    SESSION_DRAFTS: (sessionId: string) =>
      `obituary:session:${sessionId}:drafts`,
    QUESTIONNAIRE_SESSION: (sessionId: string) =>
      `obituary:questionnaire:${sessionId}`,
    CURRENT_QUESTION: (sessionId: string) =>
      `obituary:questionnaire:${sessionId}:current`,
    MEMORIAL_OBITUARY: (memorialId: string) =>
      `memorial:${memorialId}:obituary`,
    MEMORIAL_SESSION: (memorialId: string) =>
      `memorial:${memorialId}:obituary-session`,
  };

  // Cache tags for organized invalidation
  private readonly CACHE_TAGS = {
    DRAFT: (draftId: string) => `draft:${draftId}`,
    SESSION: (sessionId: string) => `session:${sessionId}`,
    MEMORIAL: (memorialId: string) => `memorial:${memorialId}`,
    OBITUARY: "obituary",
  };

  constructor(private readonly cache: CacheService) {}

  // ==================== Draft Caching ====================

  /**
   * Cache a draft by its ID
   */
  async cacheDraft(
    draft: GenerateDraftResponse | GetDraftResponse,
  ): Promise<void> {
    const key = this.KEYS.DRAFT_BY_ID(draft.id);
    const tags = [
      this.CACHE_TAGS.DRAFT(draft.id),
      this.CACHE_TAGS.SESSION(draft.sessionId),
      this.CACHE_TAGS.OBITUARY,
    ];

    await this.cache.set(key, draft, {
      ttl: this.CACHE_TTL.DRAFT,
      tags,
    });

    this.logger.debug(`Cached draft ${draft.id}`);
  }

  /**
   * Get cached draft by ID
   */
  async getCachedDraft(draftId: string): Promise<GetDraftResponse | null> {
    const key = this.KEYS.DRAFT_BY_ID(draftId);
    const result = await this.cache.get<GetDraftResponse>(key);

    if (result) {
      this.logger.debug(`Cache hit for draft ${draftId}`);
    } else {
      this.logger.debug(`Cache miss for draft ${draftId}`);
    }

    return result;
  }

  /**
   * Cache the latest draft for a session
   */
  async cacheLatestDraft(
    sessionId: string,
    draft: GenerateDraftResponse | GetDraftResponse,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = this.KEYS.LATEST_DRAFT_BY_SESSION(sessionId);
    const tags = [
      this.CACHE_TAGS.SESSION(sessionId),
      this.CACHE_TAGS.DRAFT(draft.id),
      this.CACHE_TAGS.OBITUARY,
    ];

    const ttl = ttlSeconds ?? this.CACHE_TTL.LATEST_DRAFT;

    // Cache both the latest draft reference and the draft itself
    await Promise.all([
      this.cache.set(key, draft, {
        ttl,
        tags,
      }),
      this.cacheDraft(draft),
    ]);

    this.logger.debug(
      `Cached latest draft for session ${sessionId}: ${draft.id}`,
    );
  }

  /**
   * Get cached latest draft for a session
   */
  async getCachedLatestDraft(
    sessionId: string,
  ): Promise<GetDraftResponse | null> {
    const key = this.KEYS.LATEST_DRAFT_BY_SESSION(sessionId);
    const result = await this.cache.get<GetDraftResponse>(key);

    if (result) {
      this.logger.debug(`Cache hit for latest draft of session ${sessionId}`);
    } else {
      this.logger.debug(`Cache miss for latest draft of session ${sessionId}`);
    }

    return result;
  }

  /**
   * Cache all drafts for a session
   */
  async cacheSessionDrafts(
    sessionId: string,
    drafts: GetDraftResponse[],
  ): Promise<void> {
    const key = this.KEYS.SESSION_DRAFTS(sessionId);
    const tags = [
      this.CACHE_TAGS.SESSION(sessionId),
      this.CACHE_TAGS.OBITUARY,
      ...drafts.map((draft) => this.CACHE_TAGS.DRAFT(draft.id)),
    ];

    // Cache the list and individual drafts
    await Promise.all([
      this.cache.set(key, drafts, {
        ttl: this.CACHE_TTL.SESSION_DRAFTS,
        tags,
      }),
      ...drafts.map((draft) => this.cacheDraft(draft)),
    ]);

    this.logger.debug(
      `Cached ${drafts.length} drafts for session ${sessionId}`,
    );
  }

  /**
   * Get cached drafts for a session
   */
  async getCachedSessionDrafts(
    sessionId: string,
  ): Promise<GetDraftResponse[] | null> {
    const key = this.KEYS.SESSION_DRAFTS(sessionId);
    const result = await this.cache.get<GetDraftResponse[]>(key);

    if (result) {
      this.logger.debug(
        `Cache hit for session drafts ${sessionId}: ${result.length} drafts`,
      );
    } else {
      this.logger.debug(`Cache miss for session drafts ${sessionId}`);
    }

    return result;
  }

  // ==================== Questionnaire Caching ====================

  /**
   * Cache questionnaire session data
   */
  async cacheQuestionnaireSession(
    session: QuestionnaireSessionResponse,
  ): Promise<void> {
    const key = this.KEYS.QUESTIONNAIRE_SESSION(session.sessionId);
    const tags = [
      this.CACHE_TAGS.SESSION(session.sessionId),
      this.CACHE_TAGS.OBITUARY,
    ];

    if (session.memorialId) {
      tags.push(this.CACHE_TAGS.MEMORIAL(session.memorialId));
    }

    await this.cache.set(key, session, {
      ttl: this.CACHE_TTL.QUESTIONNAIRE_SESSION,
      tags,
    });

    this.logger.debug(`Cached questionnaire session ${session.sessionId}`);
  }

  /**
   * Get cached questionnaire session
   */
  async getCachedQuestionnaireSession(
    sessionId: string,
  ): Promise<QuestionnaireSessionResponse | null> {
    const key = this.KEYS.QUESTIONNAIRE_SESSION(sessionId);
    const result = await this.cache.get<QuestionnaireSessionResponse>(key);

    if (result) {
      this.logger.debug(`Cache hit for questionnaire session ${sessionId}`);
    } else {
      this.logger.debug(`Cache miss for questionnaire session ${sessionId}`);
    }

    return result;
  }

  /**
   * Cache current question data
   */
  async cacheCurrentQuestion(
    sessionId: string,
    question: CurrentQuestionResponse,
  ): Promise<void> {
    const key = this.KEYS.CURRENT_QUESTION(sessionId);
    const tags = [this.CACHE_TAGS.SESSION(sessionId), this.CACHE_TAGS.OBITUARY];

    await this.cache.set(key, question, {
      ttl: this.CACHE_TTL.CURRENT_QUESTION,
      tags,
    });

    this.logger.debug(`Cached current question for session ${sessionId}`);
  }

  /**
   * Get cached current question
   */
  async getCachedCurrentQuestion(
    sessionId: string,
  ): Promise<CurrentQuestionResponse | null> {
    const key = this.KEYS.CURRENT_QUESTION(sessionId);
    const result = await this.cache.get<CurrentQuestionResponse>(key);

    if (result) {
      this.logger.debug(`Cache hit for current question ${sessionId}`);
    } else {
      this.logger.debug(`Cache miss for current question ${sessionId}`);
    }

    return result;
  }

  // ==================== Memorial-Obituary Association ====================

  /**
   * Cache memorial-obituary association
   */
  async cacheMemorialObituary(
    memorialId: string,
    obituaryId: string,
  ): Promise<void> {
    const key = this.KEYS.MEMORIAL_OBITUARY(memorialId);
    const tags = [
      this.CACHE_TAGS.MEMORIAL(memorialId),
      this.CACHE_TAGS.OBITUARY,
    ];

    await this.cache.set(key, obituaryId, {
      ttl: this.CACHE_TTL.MEMORIAL_OBITUARY,
      tags,
    });

    this.logger.debug(
      `Cached memorial ${memorialId} obituary association: ${obituaryId}`,
    );
  }

  /**
   * Get cached memorial obituary ID
   */
  async getCachedMemorialObituary(memorialId: string): Promise<string | null> {
    const key = this.KEYS.MEMORIAL_OBITUARY(memorialId);
    const result = await this.cache.get<string>(key);

    if (result) {
      this.logger.debug(`Cache hit for memorial ${memorialId} obituary`);
    } else {
      this.logger.debug(`Cache miss for memorial ${memorialId} obituary`);
    }

    return result;
  }

  /**
   * Cache memorial-session association
   */
  async cacheMemorialSession(
    memorialId: string,
    sessionId: string,
  ): Promise<void> {
    const key = this.KEYS.MEMORIAL_SESSION(memorialId);
    const tags = [
      this.CACHE_TAGS.MEMORIAL(memorialId),
      this.CACHE_TAGS.SESSION(sessionId),
      this.CACHE_TAGS.OBITUARY,
    ];

    await this.cache.set(key, sessionId, {
      ttl: this.CACHE_TTL.MEMORIAL_SESSION,
      tags,
    });

    this.logger.debug(
      `Cached memorial ${memorialId} session association: ${sessionId}`,
    );
  }

  /**
   * Get cached memorial session ID
   */
  async getCachedMemorialSession(memorialId: string): Promise<string | null> {
    const key = this.KEYS.MEMORIAL_SESSION(memorialId);
    const result = await this.cache.get<string>(key);

    if (result) {
      this.logger.debug(`Cache hit for memorial ${memorialId} session`);
    } else {
      this.logger.debug(`Cache miss for memorial ${memorialId} session`);
    }

    return result;
  }

  // ==================== Cache Invalidation ====================

  /**
   * Invalidate all cache entries for a specific session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    await this.cache.invalidateByTags([this.CACHE_TAGS.SESSION(sessionId)]);
    this.logger.debug(`Invalidated cache for session ${sessionId}`);
  }

  /**
   * Invalidate all cache entries for a specific memorial
   */
  async invalidateMemorial(memorialId: string): Promise<void> {
    await this.cache.invalidateByTags([this.CACHE_TAGS.MEMORIAL(memorialId)]);
    this.logger.debug(`Invalidated cache for memorial ${memorialId}`);
  }

  /**
   * Invalidate all cache entries for a specific draft
   */
  async invalidateDraft(draftId: string): Promise<void> {
    await this.cache.invalidateByTags([this.CACHE_TAGS.DRAFT(draftId)]);
    this.logger.debug(`Invalidated cache for draft ${draftId}`);
  }

  /**
   * Invalidate all obituary-related cache entries
   */
  async invalidateAll(): Promise<void> {
    await this.cache.invalidateByTags([this.CACHE_TAGS.OBITUARY]);
    this.logger.debug("Invalidated all obituary cache entries");
  }

  /**
   * Clear cache when questionnaire session is completed
   * This ensures fresh data is fetched after completion
   */
  async invalidateOnSessionCompletion(sessionId: string): Promise<void> {
    // Only invalidate current question and session progress, keep drafts
    await this.cache.del(this.KEYS.CURRENT_QUESTION(sessionId));
    await this.cache.del(this.KEYS.QUESTIONNAIRE_SESSION(sessionId));

    this.logger.debug(
      `Invalidated session progress cache for completed session ${sessionId}`,
    );
  }

  /**
   * Clear cache when new draft is generated
   * This ensures the latest draft cache is updated
   */
  async invalidateOnNewDraft(sessionId: string): Promise<void> {
    await Promise.all([
      this.cache.del(this.KEYS.LATEST_DRAFT_BY_SESSION(sessionId)),
      this.cache.del(this.KEYS.SESSION_DRAFTS(sessionId)),
    ]);

    this.logger.debug(
      `Invalidated draft cache for new draft in session ${sessionId}`,
    );
  }
}
