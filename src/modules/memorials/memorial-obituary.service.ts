import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  ObituaryServiceClient,
  StartQuestionnaireRequest,
  GenerateDraftRequest,
  GetDraftResponse,
  QuestionnaireSessionResponse,
  UpdateKeyLocationsRequest,
  CaptionResponse,
} from "../../common";
import { ObituaryCacheService } from "../../common";
import { MemorialsService } from "./memorials.service";
import { SessionAnswerDto } from "./dto/obituary.dto";
import { PrismaService } from "../../prisma/prisma.service";
import { FeedsService } from "../feeds/feeds.service";
import { FeedItemType } from "@prisma/client";

@Injectable()
export class MemorialObituaryService {
  private readonly logger = new Logger(MemorialObituaryService.name);

  constructor(
    private readonly obituaryClient: ObituaryServiceClient,
    private readonly obituaryCache: ObituaryCacheService,
    private readonly memorialsService: MemorialsService,
    private readonly prisma: PrismaService,
    private readonly feedsService: FeedsService,
  ) {}

  // ==================== Questionnaire Management ====================

  /**
   * Start a new questionnaire session for a memorial
   */
  async startQuestionnaire(
    memorialId: string,
    userId: string,
    maxQuestions?: number,
    deceasedFullName?: string,
    yearOfBirth?: number,
    yearOfPassing?: number,
    keyLocationsText?: string,
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
      deceasedFullName,
      yearOfBirth,
      yearOfPassing,
      keyLocationsText,
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
  async getQuestionnaireSession(
    sessionId: string,
  ): Promise<QuestionnaireSessionResponse> {
    // Try cache first
    let session: QuestionnaireSessionResponse | null =
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
  async answerQuestion(sessionId: string, answer: SessionAnswerDto) {
    const response = await this.obituaryClient.answerQuestion(
      sessionId,
      answer,
    );

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
   * Get obituary status for a memorial (active session, answered counts, etc.)
   */
  async getObituaryStatus(memorialId: string, userId?: string) {
    // Ensure memorial exists and the caller can access it
    const memorial = await this.memorialsService.getById(memorialId, userId);

    // Determine if there is a published obituary
    const latestPublished = await this.prisma.publishedObituary.findFirst({
      where: { memorialId },
      orderBy: { publishedAt: "desc" },
      select: { id: true, caption: true, draftId: true },
    });
    const publishedObituaryId =
      latestPublished?.id ?? memorial.obituaryId ?? null;
    const isPublished = Boolean(publishedObituaryId);

    type CaptionVariant = unknown;
    let publishedCaptions: CaptionVariant[] | null = null;
    if (latestPublished?.caption?.captionText) {
      try {
        const parsed = JSON.parse(latestPublished.caption.captionText);
        publishedCaptions = Array.isArray(parsed) ? parsed : null;
      } catch (error) {
        this.logger.warn(
          `getObituaryStatus - failed to parse published captions for memorial=${memorialId}: ${error}`,
        );
      }
    }

    // Backfill captions from obituary service if published but missing
    if (isPublished && !publishedCaptions && latestPublished?.draftId) {
      try {
        const upstream = await this.obituaryClient.getCaptions(
          latestPublished.draftId,
        );
        const captions = upstream.captions ?? [];
        publishedCaptions = Array.isArray(captions) ? captions : null;

        if (publishedCaptions) {
          await this.prisma.publishedObituary.update({
            where: { id: latestPublished.id },
            data: {
              caption: {
                draftId: upstream.draftId ?? latestPublished.draftId,
                captionText: JSON.stringify(publishedCaptions),
                createdAt: upstream.createdAt
                  ? new Date(upstream.createdAt)
                  : new Date(),
              },
            },
          });
        }
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 404 && latestPublished?.draftId) {
          try {
            const generated = await this.obituaryClient.generateCaptions(
              latestPublished.draftId,
            );
            const captions = generated.captions ?? [];
            publishedCaptions = Array.isArray(captions) ? captions : null;

            if (publishedCaptions) {
              await this.prisma.publishedObituary.update({
                where: { id: latestPublished.id },
                data: {
                  caption: {
                    draftId: generated.draftId ?? latestPublished.draftId,
                    captionText: JSON.stringify(publishedCaptions),
                    createdAt: generated.createdAt
                      ? new Date(generated.createdAt)
                      : new Date(),
                  },
                },
              });
            }
          } catch (genError) {
            this.logger.warn(
              `getObituaryStatus - failed to generate captions for memorial=${memorialId} draft=${latestPublished.draftId}: ${genError}`,
            );
          }
        } else {
          this.logger.warn(
            `getObituaryStatus - failed to fetch captions for memorial=${memorialId} draft=${latestPublished?.draftId}: ${error}`,
          );
        }
      }
    }

    // Try cached memorial->session mapping first
    let sessionId =
      await this.obituaryCache.getCachedMemorialSession(memorialId);

    // Fallback to stored session id on the memorial record
    if (!sessionId && memorial.obituaryServiceSessionId) {
      sessionId = memorial.obituaryServiceSessionId;
      // Cache it for future fast lookup
      await this.obituaryCache.cacheMemorialSession(memorialId, sessionId);
    }

    if (!sessionId) {
      return {
        hasActive: false,
        published: isPublished,
        obituaryId: publishedObituaryId,
        publishedCaptions,
        status: isPublished ? "published" : "none",
      } as const;
    }

    // Fetch session progress (cache first, then service)
    let session =
      await this.obituaryCache.getCachedQuestionnaireSession(sessionId);
    if (!session) {
      session = await this.obituaryClient.getQuestionnaireSession(sessionId);
      if (session) {
        await this.obituaryCache.cacheQuestionnaireSession(session);
      }
    }

    // If the cached session lacks progress data, refresh from source
    if (
      session &&
      ((session.answeredQuestions ?? session.progress?.answered ?? null) ===
        null ||
        session.progress?.total === undefined)
    ) {
      const freshSession =
        await this.obituaryClient.getQuestionnaireSession(sessionId);
      if (freshSession) {
        session = freshSession;
        await this.obituaryCache.cacheQuestionnaireSession(freshSession);
      }
    }

    // Derive answered/total with null when unavailable to avoid misleading zeros
    // Normalize questionnaire progress fields to handle different shapes (answeredCount/totalQuestions)
    const answered =
      session?.answeredQuestions ??
      (session as { answeredCount?: number }).answeredCount ??
      session?.progress?.answered ??
      null;

    const total =
      session?.progress?.total ??
      (session as { totalQuestions?: number }).totalQuestions ??
      session?.maxQuestions ??
      null;

    const completionRate =
      session?.progress?.percentage ??
      (session as { completionRate?: number }).completionRate ??
      (answered !== null && total
        ? Math.round((answered / total) * 100)
        : null);

    if (answered === null || total === null) {
      this.logger.warn(
        `getObituaryStatus - missing progress for memorial=${memorialId} session=${sessionId}; session keys=${session ? Object.keys(session).join(",") : "none"}`,
      );
    }

    if (!session) {
      return {
        hasActive: false,
        published: isPublished,
        obituaryId: publishedObituaryId,
        status: isPublished ? "published" : "unknown",
      } as const;
    }

    const isCompleted = Boolean(session.isCompleted);

    return {
      hasActive: !isCompleted && !isPublished,
      status: isPublished
        ? "published"
        : isCompleted
          ? "completed"
          : "in_progress",
      sessionId,
      answeredQuestions: answered,
      totalQuestions: total,
      completionRate,
      progress: session.progress ?? null,
      published: isPublished,
      obituaryId: publishedObituaryId,
      publishedCaptions,
    };
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

  /**
   * Submit additional context for the questionnaire
   */
  async submitAdditionalContext(sessionId: string, additionalContext: string) {
    this.logger.debug(`Submitting additional context for session ${sessionId}`);

    const response = await this.obituaryClient.submitAdditionalContext(
      sessionId,
      { additionalContext },
    );

    this.logger.log(`Additional context submitted for session ${sessionId}`);

    return response;
  }

  /**
   * Update key locations text for an existing questionnaire session
   */
  async updateKeyLocations(sessionId: string, keyLocationsText: string) {
    this.logger.debug(`Updating key locations for session ${sessionId}`);

    const request: UpdateKeyLocationsRequest = { keyLocationsText };
    const response = await this.obituaryClient.updateKeyLocations(
      sessionId,
      request,
    );

    this.logger.log(`Key locations updated for session ${sessionId}`);

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

    // Short-circuit if we already have a latest draft (cached or existing upstream)
    const cachedLatest =
      await this.obituaryCache.getCachedLatestDraft(sessionId);
    if (cachedLatest) {
      this.logger.debug(
        `Returning cached latest draft for session ${sessionId}`,
      );
      const session = await this.getQuestionnaireSession(sessionId);
      return { draft: cachedLatest, memorialId: session.memorialId ?? null };
    }

    try {
      const existingLatest =
        await this.obituaryClient.getLatestDraft(sessionId);
      if (existingLatest) {
        await this.obituaryCache.cacheLatestDraft(sessionId, existingLatest);
        this.logger.debug(
          `Returning existing latest draft from obituary service for session ${sessionId}`,
        );
        const session = await this.getQuestionnaireSession(sessionId);
        return {
          draft: existingLatest,
          memorialId: session.memorialId ?? null,
        };
      }
    } catch (error) {
      if (
        !(error instanceof NotFoundException) &&
        !(
          error &&
          typeof error === "object" &&
          "response" in error &&
          (error as { response?: { status?: number } }).response?.status === 404
        )
      ) {
        throw error;
      }
      // 404: proceed to generate
    }

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
    return { draft, memorialId: session.memorialId ?? null };
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
      // Cache regenerate result briefly (1 minute) to avoid rapid duplicate calls
      this.obituaryCache.cacheLatestDraft(draft.sessionId, draft, 60),
      this.obituaryCache.invalidateOnNewDraft(draft.sessionId),
    ]);

    // Get session to surface memorialId in response
    const session = await this.getQuestionnaireSession(draft.sessionId);

    this.logger.log(`Regenerated draft ${draft.id}`);
    return { draft, memorialId: session.memorialId ?? null };
  }

  /**
   * Generate caption variants for a draft tied to a memorial
   */
  async generateDraftCaptions(
    memorialId: string,
    draftId: string,
    userId: string,
  ): Promise<CaptionResponse> {
    await this.ensureDraftBelongsToMemorial(memorialId, draftId, userId);

    const response = await this.obituaryClient.generateCaptions(draftId);
    this.logger.log(
      `Generated captions for draft ${draftId} (memorial ${memorialId})`,
    );

    await this.obituaryCache.cacheDraftCaptions(draftId, response);

    return response;
  }

  /**
   * Get stored caption variants for a draft tied to a memorial
   */
  async getDraftCaptions(
    memorialId: string,
    draftId: string,
    userId: string,
  ): Promise<CaptionResponse> {
    await this.ensureDraftBelongsToMemorial(memorialId, draftId, userId);

    this.logger.debug(
      `Fetching captions for draft ${draftId} (memorial ${memorialId})`,
    );

    const cached = await this.obituaryCache.getCachedDraftCaptions(draftId);
    if (cached) {
      return cached;
    }

    try {
      const captions = await this.obituaryClient.getCaptions(draftId);
      await this.obituaryCache.cacheDraftCaptions(draftId, captions);
      return captions;
    } catch (error: any) {
      const status = error?.response?.status;

      // If captions haven't been generated yet, return an empty set instead of throwing
      if (status === 404) {
        this.logger.warn(
          `Captions not found upstream for draft ${draftId}; returning empty set`,
        );
        const empty: CaptionResponse = {
          draftId,
          captions: [],
          createdAt: new Date().toISOString(),
        };

        // Cache empty result briefly to avoid repeated upstream lookups
        await this.obituaryCache.cacheDraftCaptions(draftId, empty, 60);
        return empty;
      }

      throw error;
    }
  }

  /**
   * Publish a generated draft into the afterlife service store
   */
  async publishDraft(memorialId: string, draftId: string, userId: string) {
    // Verify memorial ownership/access
    const memorial = await this.memorialsService.getById(memorialId, userId);
    if (!memorial) {
      throw new NotFoundException(`Memorial ${memorialId} not found`);
    }

    // Fetch draft from obituary service
    const draft = await this.obituaryClient.getDraft(draftId);

    const version =
      "version" in draft
        ? ((draft as { version?: number | null }).version ?? null)
        : null;

    // Validate session association when present
    if (
      memorial.obituaryServiceSessionId &&
      draft.sessionId &&
      memorial.obituaryServiceSessionId !== draft.sessionId
    ) {
      throw new NotFoundException(
        "Draft does not belong to this memorial session",
      );
    }

    // Fetch or generate captions so we can store them alongside the published obituary
    let captionPayload: {
      draftId: string;
      captionText: string;
      createdAt: Date;
    } | null = null;
    try {
      const captionResponse = await this.obituaryClient.getCaptions(draftId);
      captionPayload = {
        draftId,
        captionText: JSON.stringify(captionResponse.captions ?? []),
        createdAt: captionResponse.createdAt
          ? new Date(captionResponse.createdAt)
          : new Date(),
      };
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        try {
          const generated = await this.obituaryClient.generateCaptions(draftId);
          captionPayload = {
            draftId,
            captionText: JSON.stringify(generated.captions ?? []),
            createdAt: generated.createdAt
              ? new Date(generated.createdAt)
              : new Date(),
          };
        } catch (genError) {
          this.logger.warn(
            `publishDraft - failed to generate captions for draft ${draftId}: ${genError}`,
          );
        }
      } else {
        this.logger.warn(
          `publishDraft - failed to fetch captions for draft ${draftId}: ${error}`,
        );
      }
    }

    // Persist published copy (attach captions when available)
    const published = await this.prisma.publishedObituary.create({
      data: {
        memorialId,
        draftId,
        sessionId: draft.sessionId,
        tone: draft.tone,
        length: draft.length,
        content: draft.content,
        wordCount: draft.metadata?.wordCount,
        version,
        ...(captionPayload
          ? {
              caption: {
                draftId: captionPayload.draftId,
                captionText: captionPayload.captionText,
                createdAt: captionPayload.createdAt,
              },
            }
          : {}),
      },
    });

    // Enforce a maximum of 5 published versions per memorial by removing oldest
    const excess = await this.prisma.publishedObituary.findMany({
      where: { memorialId },
      orderBy: { publishedAt: "desc" },
      skip: 5,
      select: { id: true },
    });

    if (excess.length > 0) {
      const toDeleteIds = excess.map((e) => e.id);
      await this.prisma.publishedObituary.deleteMany({
        where: { id: { in: toDeleteIds } },
      });
      this.logger.log(
        `publishDraft - trimmed ${toDeleteIds.length} old published obituary versions for memorial ${memorialId}`,
      );
    }

    // Update memorial pointer to published obituary
    await this.memorialsService.updateObituaryId(memorialId, published.id);

    // Emit feed item for obituary publication
    await this.feedsService.createActivityFeedItem({
      type: FeedItemType.OBITUARY_UPDATE,
      memorialId,
      obituaryId: published.id,
      title: "Obituary published",
      body: draft.content?.slice(0, 240) ?? undefined,
      audienceTags: ["FOLLOWING", "MEMORIAL"],
      audienceUserIds: [memorial.ownerUserId],
      visibility: memorial.visibility,
      sources: [draftId],
    });

    return published;
  }

  /**
   * Get latest published obituary for a memorial
   */
  async getPublishedObituary(memorialId: string) {
    const published = await this.prisma.publishedObituary.findFirst({
      where: { memorialId },
      orderBy: { publishedAt: "desc" },
    });

    if (!published) {
      throw new NotFoundException("No published obituary found");
    }

    return published;
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

  private async ensureDraftBelongsToMemorial(
    memorialId: string,
    draftId: string,
    userId: string,
  ) {
    const memorial = await this.memorialsService.getById(memorialId, userId);
    const draft = await this.getDraft(draftId);

    if (
      memorial.obituaryServiceSessionId &&
      draft.sessionId &&
      memorial.obituaryServiceSessionId !== draft.sessionId
    ) {
      throw new NotFoundException("Draft does not belong to this memorial");
    }

    return { memorial, draft };
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
