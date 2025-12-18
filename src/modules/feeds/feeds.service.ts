import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  FollowTargetType,
  FeedItemType,
  FeedStatement,
  LikeTargetType,
  Post,
  PostStatus,
  Prisma,
  Visibility,
  Statement,
} from "@prisma/client";
import * as crypto from "crypto";
import { RedisService } from "../redis/redis.service";
import { FeedTemplateService } from "./template.service";

export interface FeedEntryWithPost {
  id: string;
  publishedAt: Date;
  score: number | null;
  reasons: string[];
  post: {
    id: string;
    caption: string | null;
    tags: string[];
    author: {
      id: string;
      handle?: string | null;
      imageUrl?: string | null;
    };
    links: {
      webUrl: string;
      iosAppUrl?: string;
      androidAppUrl?: string;
    };
    visibility: string;
    status: string;
    baseMediaUrl?: string;
    baseMediaType?: string;
    durationMs?: number | null;
    publishedAt: Date | null;
    theme: string;
    memorialCoverUrl: string | null;
    memorialId: string | null;
    metrics: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
}

type CachedFeedEntry = Omit<FeedEntryWithPost, "publishedAt" | "post"> & {
  publishedAt: string;
  post: Omit<
    FeedEntryWithPost["post"],
    "publishedAt" | "createdAt" | "updatedAt"
  > & {
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

type PostWithMemorial = Prisma.PostGetPayload<{
  include: {
    memorial: true;
    author: { select: { handle: true; imageUrl: true; id: true } };
  };
}>;

export interface ActivityFeedItemDto {
  id: string;
  type: FeedItemType;
  memorialId?: string | null;
  memorialDisplayName?: string | null;
  fundraisingId?: string | null;
  obituaryId?: string | null;
  actorUserId?: string | null;
  parts: Statement[];
  audienceTags: string[];
  audienceUserIds: string[];
  lat?: number | null;
  lng?: number | null;
  geoHash?: string | null;
  country?: string | null;
  visibility?: Visibility | null;
  metadata?: Prisma.JsonValue;
  createdAt: Date;
}

export interface CreateFeedStatementInput {
  type: FeedItemType;
  memorialId?: string | null;
  fundraisingId?: string | null;
  obituaryId?: string | null;
  actorUserId?: string | null;
  audienceTags?: string[];
  audienceUserIds?: string[];
  lat?: number | null;
  lng?: number | null;
  country?: string | null;
  visibility?: Visibility | null;
  metadata?: Prisma.JsonValue;
  parts?: Statement[];
  templatePayload?: Record<string, unknown>;
}

@Injectable()
export class FeedsService {
  private readonly logger = new Logger("FeedsService");
  private readonly maxFeedSize = 200;
  private readonly cacheTtlSeconds = 60 * 15; // 15 minutes
  private readonly highEngagementThreshold = 25; // heuristic to keep global feed interesting
  private readonly geoHashPrecision = 2; // coarse bucket for proximity grouping

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private readonly templateService: FeedTemplateService,
  ) {}

  /**
   * Create a structured activity feed item for memorial/fundraising/obituary events.
   */
  async createActivityFeedItem(
    input: CreateFeedStatementInput,
  ): Promise<ActivityFeedItemDto> {
    const geoHash =
      input.lat !== undefined &&
      input.lat !== null &&
      input.lng !== undefined &&
      input.lng !== null
        ? this.computeGeoHash(input.lat, input.lng)
        : undefined;

    const parts =
      input.parts ??
      this.templateService.renderParts({
        type: input.type,
        payload: input.templatePayload ?? {},
      }).parts;

    const memorialTheme = input.memorialId
      ? (
          await this.prisma.memorial.findUnique({
            where: { id: input.memorialId },
            select: { theme: true },
          })
        )?.theme
      : undefined;

    const mergedMetadata =
      memorialTheme !== undefined
        ? {
            ...(input.metadata && typeof input.metadata === "object"
              ? (input.metadata as Record<string, unknown>)
              : {}),
            theme: memorialTheme,
          }
        : (input.metadata ?? undefined);

    const item = await this.prisma.feedStatement.create({
      data: {
        type: input.type,
        memorialId: input.memorialId ?? undefined,
        fundraisingId: input.fundraisingId ?? undefined,
        obituaryId: input.obituaryId ?? undefined,
        parts,
        actorUserId: input.actorUserId ?? undefined,
        audienceTags: input.audienceTags ?? [],
        audienceUserIds: input.audienceUserIds ?? [],
        lat: input.lat ?? undefined,
        lng: input.lng ?? undefined,
        geoHash: geoHash ?? undefined,
        country: input.country ?? undefined,
        visibility: input.visibility ?? undefined,
        metadata: mergedMetadata,
      },
    });

    const memorialDisplayName = item.memorialId
      ? await this.getMemorialDisplayName(item.memorialId)
      : null;

    return this.buildActivityFeedItemDto(item, memorialDisplayName);
  }

  /**
   * Community lane: proximity + country + followed memorials.
   */
  async getCommunityActivityFeedEntries({
    userId,
    country,
    lat,
    lng,
    limit = 20,
    cursor,
  }: {
    userId?: string;
    country?: string;
    lat?: number;
    lng?: number;
    limit?: number;
    cursor?: string;
  }) {
    const safeLimit = Math.max(1, Math.min(limit, this.maxFeedSize));
    const normalizedCountry = country?.trim()?.toUpperCase();
    const geoHash =
      lat !== undefined && lat !== null && lng !== undefined && lng !== null
        ? this.computeGeoHash(lat, lng)
        : undefined;

    const filters: Prisma.FeedStatementWhereInput[] = [];
    if (normalizedCountry) {
      filters.push({ country: normalizedCountry });
    }
    if (geoHash) {
      filters.push({ geoHash: { startsWith: geoHash } });
    }

    const followedMemorialIds = userId
      ? await this.getFollowedMemorialIds(userId)
      : [];
    if (followedMemorialIds.length) {
      filters.push({ memorialId: { in: followedMemorialIds } });
    }

    const where: Prisma.FeedStatementWhereInput =
      filters.length > 0 ? { OR: filters } : {};

    const items = await this.prisma.feedStatement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: safeLimit + 1,
    });

    const memorialNames = await this.hydrateMemorialNames(items);

    return this.paginateActivityItems(items, safeLimit, memorialNames);
  }

  /**
   * Personal lane: items where the user is actor, target, or follows the memorial.
   */
  async getPersonalActivityFeedEntries({
    userId,
    limit = 20,
    cursor,
  }: {
    userId: string;
    limit?: number;
    cursor?: string;
  }) {
    const safeLimit = Math.max(1, Math.min(limit, this.maxFeedSize));
    const filters: Prisma.FeedStatementWhereInput[] = [];

    filters.push({ audienceUserIds: { has: userId } });
    filters.push({ actorUserId: userId });

    const followedMemorialIds = await this.getFollowedMemorialIds(userId);
    if (followedMemorialIds.length) {
      filters.push({ memorialId: { in: followedMemorialIds } });
    }

    const where: Prisma.FeedStatementWhereInput = { OR: filters };

    const items = await this.prisma.feedStatement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: safeLimit + 1,
    });

    const memorialNames = await this.hydrateMemorialNames(items);

    return this.paginateActivityItems(items, safeLimit, memorialNames);
  }

  /**
   * Get paginated global feed built from high-engagement videos.
   */
  async getGlobalFeedEntries({
    limit = 20,
    cursor,
    userId,
  }: {
    limit?: number;
    cursor?: string;
    userId?: string;
  } = {}) {
    const safeLimit = Math.max(1, Math.min(limit, this.maxFeedSize));
    const cacheKey = this.getGlobalFeedCacheKey();

    let entries = await this.getCachedFeedEntries(cacheKey);
    if (!entries) {
      entries = await this.buildAndCacheGlobalFeed();
    }

    const preferenceTags = userId
      ? await this.resolvePreferenceTags(userId)
      : new Set<string>();

    const personalized = this.applyPreferenceOverlay(entries, preferenceTags);
    return this.paginateEntries(personalized, safeLimit, cursor);
  }

  /**
   * Fallback feed: chronological list of published posts.
   */
  async getFallbackFeedEntries({
    limit = 20,
    cursor,
    userId,
  }: {
    limit?: number;
    cursor?: string;
    userId?: string;
  } = {}) {
    const safeLimit = Math.max(1, Math.min(limit, this.maxFeedSize));
    const cacheKey = this.getFallbackFeedCacheKey();

    let entries = await this.getCachedFeedEntries(cacheKey);
    if (!entries) {
      entries = await this.buildAndCacheFallbackFeed();
    }

    const preferenceTags = userId
      ? await this.resolvePreferenceTags(userId)
      : new Set<string>();

    const personalized = this.applyPreferenceOverlay(entries, preferenceTags);
    return this.paginateEntries(personalized, safeLimit, cursor);
  }

  /**
   * Add a post entry to the memorial's cached feed, recomputing if needed.
   */
  async addEntryForMemorialPost(
    memorialId: string,
    postId: string,
    reasons: string[],
  ) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        memorial: true,
        author: {
          select: { handle: true, imageUrl: true, id: true },
        },
      },
    });

    if (!post) {
      this.logger.warn(`Cannot add post ${postId} to feed; post not found`);
      return null;
    }

    if (post.status !== PostStatus.PUBLISHED) {
      this.logger.warn(
        `Cannot add post ${postId} to feed; status ${post.status} is not publishable`,
      );
      return null;
    }

    if (post.memorialId !== memorialId) {
      this.logger.warn(
        `Cannot add post ${postId} to memorial ${memorialId}; memorial mismatch`,
      );
      return null;
    }

    const entry = this.buildFeedEntry(post, reasons);
    const cacheKey = this.getMemorialFeedCacheKey(memorialId);
    const existingEntries = (await this.getCachedFeedEntries(cacheKey)) ?? [];
    const merged = this.mergeEntries([entry, ...existingEntries]);

    await this.writeFeedEntriesToCache(cacheKey, merged);
    return entry;
  }

  /**
   * Get paginated feed entries for a memorial, hydrating from cache or DB.
   */
  async getMemorialFeedEntries(
    memorialId: string,
    {
      limit = 20,
      cursor,
      userId,
    }: {
      limit?: number;
      cursor?: string;
      userId?: string;
    } = {},
  ): Promise<FeedEntryWithPost[]> {
    const safeLimit = Math.max(1, Math.min(limit, this.maxFeedSize));
    const cacheKey = this.getMemorialFeedCacheKey(memorialId);

    let entries = await this.getCachedFeedEntries(cacheKey);
    if (!entries) {
      entries = await this.buildAndCacheMemorialFeed(memorialId);
    }

    const preferenceTags = userId
      ? await this.resolvePreferenceTags(userId)
      : new Set<string>();

    const personalized = this.applyPreferenceOverlay(entries, preferenceTags);
    return this.paginateEntries(personalized, safeLimit, cursor);
  }

  /**
   * Force a rebuild of a memorial feed and refresh the cache.
   */
  async rebuildMemorialFeed(memorialId: string) {
    const entries = await this.buildAndCacheMemorialFeed(memorialId);
    this.logger.log(
      `Rebuilt feed for memorial ${memorialId} with ${entries.length} posts`,
    );
    return entries;
  }

  private getGlobalFeedCacheKey() {
    return "feed:global:video-high-engagement";
  }

  private getFallbackFeedCacheKey() {
    return "feed:fallback:chronological";
  }

  private getMemorialFeedCacheKey(memorialId: string) {
    return `feed:memorial:${memorialId}`;
  }

  private async buildAndCacheGlobalFeed() {
    const entries = await this.buildGlobalFeedEntries();
    await this.writeFeedEntriesToCache(this.getGlobalFeedCacheKey(), entries);
    return entries;
  }

  private async buildAndCacheFallbackFeed() {
    const entries = await this.buildFallbackFeedEntries();
    await this.writeFeedEntriesToCache(this.getFallbackFeedCacheKey(), entries);
    return entries;
  }

  private async buildAndCacheMemorialFeed(memorialId: string) {
    const entries = await this.buildFeedEntriesForMemorial(memorialId);
    await this.writeFeedEntriesToCache(
      this.getMemorialFeedCacheKey(memorialId),
      entries,
    );
    return entries;
  }

  private async buildFeedEntriesForMemorial(memorialId: string) {
    const posts = await this.prisma.post.findMany({
      where: {
        memorialId,
        status: PostStatus.PUBLISHED,
      },
      orderBy: { publishedAt: "desc" },
      take: this.maxFeedSize,
      include: {
        memorial: true,
        author: {
          select: { handle: true, imageUrl: true, id: true },
        },
      },
    });

    const sorted = [...posts].sort((a, b) => {
      const aDate = (a.publishedAt ?? a.createdAt).getTime();
      const bDate = (b.publishedAt ?? b.createdAt).getTime();
      return bDate - aDate;
    });

    return sorted.map((post) =>
      this.buildFeedEntry(post, this.deriveReasonsFromPost(post)),
    );
  }

  private async buildFallbackFeedEntries() {
    const posts = await this.prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: this.maxFeedSize,
      include: {
        memorial: true,
        author: {
          select: { handle: true, imageUrl: true, id: true },
        },
      },
    });

    return posts.map((post) => {
      const reasons = Array.from(
        new Set(["FALLBACK", ...this.deriveReasonsFromPost(post)]),
      );
      return this.buildFeedEntry(post, reasons);
    });
  }

  private async buildGlobalFeedEntries() {
    const candidates = await this.prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        visibility: Visibility.PUBLIC,
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: this.maxFeedSize * 3, // wider net before engagement filtering
      include: {
        memorial: true,
        author: {
          select: { handle: true, imageUrl: true, id: true },
        },
      },
    });

    const highEngagementVideos = candidates
      .filter((post) => this.isHighEngagementVideo(post))
      .map((post) => ({
        post,
        engagementScore: this.computeEngagementScore(post),
      }))
      .sort((a, b) => {
        if (b.engagementScore !== a.engagementScore) {
          return b.engagementScore - a.engagementScore;
        }
        const aDate = (a.post.publishedAt ?? a.post.createdAt).getTime();
        const bDate = (b.post.publishedAt ?? b.post.createdAt).getTime();
        return bDate - aDate;
      })
      .slice(0, this.maxFeedSize);

    return highEngagementVideos.map(({ post }) => {
      const reasons = [
        "HIGH_ENGAGEMENT",
        "VIDEO",
        ...this.deriveReasonsFromPost(post),
      ];
      const dedupedReasons = Array.from(new Set(reasons));
      return this.buildFeedEntry(post, dedupedReasons);
    });
  }

  private buildFeedEntry(
    post: PostWithMemorial,
    reasons: string[],
    preferenceTags?: Set<string>,
  ): FeedEntryWithPost {
    const normalizedReasons = reasons.length ? [...reasons] : ["RECENT_POST"];
    const entryId = this.generateEntryId(post.id, post.memorialId ?? "GLOBAL");

    const shareBase =
      process.env.SHARE_BASE_URL || "https://share.welcometotheafterlife.app";
    const iosBase = process.env.IOS_APP_SCHEMA || "theafterlife";
    const androidBase =
      process.env.ANDROID_APP_SCHEMA || "com.thehereafter.afterlife";
    return {
      id: entryId,
      publishedAt: post.publishedAt ?? post.createdAt,
      score: this.scorePost(post, preferenceTags),
      reasons: normalizedReasons,
      post: {
        id: post.id,
        caption: post.caption,
        tags: post.tags ?? [],
        visibility: post.visibility,
        status: post.status,
        links: {
          webUrl: `${shareBase}/p/${post.id}`,
          iosAppUrl: `${iosBase}://tributes/?startsWith=${post.id}`,
          androidAppUrl: `${androidBase}://tributes/?startsWith=${post.id}`,
        },
        author: {
          id: post.author?.id as string,
          handle: post.author?.handle,
          imageUrl: post.author?.imageUrl,
        },
        publishedAt: post.publishedAt,
        baseMediaUrl: post.baseMedia?.url,
        baseMediaType: post.baseMedia?.mediaType,
        durationMs: post.baseMedia?.durationMs,
        metrics: post.metrics,
        updatedAt: post.updatedAt,
        theme: post.memorial?.theme || "default",
        memorialCoverUrl: post.memorial?.coverAssetUrl || null,
        memorialId: post.memorialId || null,
        createdAt: post.createdAt,
      },
    };
  }

  private deriveReasonsFromPost(post: Post, preferenceTags?: Set<string>) {
    const reasons = ["RECENT_POST"];

    if (post.tags?.length) {
      for (const tag of post.tags.slice(0, 3)) {
        reasons.push(`TAG:${tag}`);
      }
    }

    if (preferenceTags && post.tags?.some((tag) => preferenceTags.has(tag))) {
      reasons.push("PREFERENCE_MATCH");
    }

    if (post.visibility !== "PUBLIC") {
      reasons.push(`VISIBILITY:${post.visibility}`);
    }

    return reasons;
  }

  private computeEngagementScore(post: Post) {
    const likes = this.extractMetricNumber(post.metrics, "likes");
    const impressions = this.extractMetricNumber(post.metrics, "impressions");
    const watchTimeMs = this.extractMetricNumber(post.metrics, "watchTimeMs");
    const clicks = this.extractMetricNumber(post.metrics, "clicks");

    const score =
      likes * 3 + clicks * 2 + impressions * 0.05 + watchTimeMs / 1000; // 1 point per second of aggregate watch time

    return Number(score.toFixed(4));
  }

  private isHighEngagementVideo(post: Post) {
    const mediaType = post.baseMedia?.mediaType?.toLowerCase();
    if (mediaType !== "video") {
      return false;
    }

    const engagementScore = this.computeEngagementScore(post);
    if (engagementScore < this.highEngagementThreshold) {
      return false;
    }

    const likes = this.extractMetricNumber(post.metrics, "likes");
    const impressions = this.extractMetricNumber(post.metrics, "impressions");

    // Require at least one strong signal in addition to the aggregate score.
    return likes >= 5 || impressions >= 200;
  }

  private scorePost(post: Post, preferenceTags?: Set<string>) {
    const now = Date.now();
    const publishedAt = (post.publishedAt ?? post.createdAt).getTime();
    const ageMs = Math.max(0, now - publishedAt);
    const daysOld = ageMs / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.max(0, 1 - daysOld / 30); // decay over ~1 month
    const tags = post.tags ?? [];
    const preferenceWeight = preferenceTags
      ? tags.filter((tag) => preferenceTags.has(tag)).length * 0.2
      : 0;
    const engagementWeight =
      this.extractMetricNumber(post.metrics, "likes") * 0.01 +
      this.extractMetricNumber(post.metrics, "impressions") * 0.001;

    const score =
      1 + recencyWeight + preferenceWeight + Math.min(engagementWeight, 1);
    return Number(score.toFixed(4));
  }

  private extractMetricNumber(metrics: unknown, field: string) {
    if (
      metrics &&
      typeof metrics === "object" &&
      field in (metrics as Record<string, unknown>)
    ) {
      const value = (metrics as Record<string, unknown>)[field];
      if (typeof value === "number") {
        return value;
      }
    }

    return 0;
  }

  private mergeEntries(entries: FeedEntryWithPost[]) {
    const seen = new Set<string>();
    const deduped: FeedEntryWithPost[] = [];

    for (const entry of entries) {
      if (seen.has(entry.post.id)) {
        continue;
      }
      seen.add(entry.post.id);
      deduped.push(entry);
      if (deduped.length >= this.maxFeedSize) {
        break;
      }
    }

    return deduped;
  }

  private async getCachedFeedEntries(cacheKey: string) {
    const cached = await this.redis.get<CachedFeedEntry[]>(cacheKey);
    if (!cached) {
      return null;
    }

    return cached.map((entry) => this.deserializeCachedEntry(entry));
  }

  private deserializeCachedEntry(entry: CachedFeedEntry): FeedEntryWithPost {
    return {
      ...entry,
      publishedAt: new Date(entry.publishedAt),
      reasons: [...entry.reasons],
      post: {
        ...entry.post,
        tags: [...entry.post.tags],
        publishedAt: entry.post.publishedAt
          ? new Date(entry.post.publishedAt)
          : null,
        createdAt: new Date(entry.post.createdAt),
        updatedAt: new Date(entry.post.updatedAt),
      },
    };
  }

  private async writeFeedEntriesToCache(
    cacheKey: string,
    entries: FeedEntryWithPost[],
  ) {
    if (!entries.length) {
      await this.redis.del(cacheKey);
      return;
    }

    await this.redis.set(cacheKey, entries, this.cacheTtlSeconds);
  }

  private applyPreferenceOverlay(
    entries: FeedEntryWithPost[],
    preferenceTags: Set<string>,
  ) {
    if (!preferenceTags.size) {
      return entries;
    }

    return entries.map((entry) => {
      if (!entry.post.tags.some((tag) => preferenceTags.has(tag))) {
        return entry;
      }

      const newScore = Number(((entry.score ?? 1) + 0.5).toFixed(4));
      const reasons = entry.reasons.includes("PREFERENCE_MATCH")
        ? entry.reasons
        : [...entry.reasons, "PREFERENCE_MATCH"];

      return {
        ...entry,
        score: newScore,
        reasons,
      };
    });
  }

  private paginateEntries(
    entries: FeedEntryWithPost[],
    limit: number,
    cursor?: string,
  ) {
    if (!cursor) {
      return entries.slice(0, limit);
    }

    const cursorIndex = entries.findIndex((entry) => entry.id === cursor);
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    return entries.slice(startIndex, startIndex + limit);
  }

  private async resolvePreferenceTags(userId?: string) {
    if (!userId) {
      return new Set<string>();
    }

    const [likes, follows] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId, targetType: LikeTargetType.POST },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.follow.findMany({
        where: { userId, targetType: FollowTargetType.MEMORIAL },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const likedPostIds = likes.map((like) => like.targetId);
    const followedMemorialIds = follows.map((follow) => follow.targetId);

    type TagCarrier = { tags: string[] | null };
    const likedPostsPromise: Promise<TagCarrier[]> = likedPostIds.length
      ? this.prisma.post.findMany({
          where: { id: { in: likedPostIds } },
          select: { id: true, tags: true },
        })
      : Promise.resolve([]);

    const followedMemorialsPromise: Promise<TagCarrier[]> =
      followedMemorialIds.length
        ? this.prisma.memorial.findMany({
            where: { id: { in: followedMemorialIds } },
            select: { id: true, tags: true },
          })
        : Promise.resolve([]);

    const [likedPosts, followedMemorials] = await Promise.all([
      likedPostsPromise,
      followedMemorialsPromise,
    ]);

    const tags = new Set<string>();

    likedPosts.forEach((post) => {
      (post.tags ?? []).forEach((tag) => tags.add(tag));
    });

    followedMemorials.forEach((memorial) => {
      (memorial.tags ?? []).forEach((tag) => tags.add(tag));
    });

    return tags;
  }

  private generateEntryId(postId: string, scope: string) {
    return crypto.createHash("sha1").update(`${scope}:${postId}`).digest("hex");
  }

  private async getMemorialDisplayName(memorialId: string) {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
      select: { displayName: true },
    });

    return memorial?.displayName ?? null;
  }

  private async hydrateMemorialNames(items: FeedStatement[]) {
    const memorialIds = Array.from(
      new Set(
        items.map((i) => i.memorialId).filter((id): id is string => !!id),
      ),
    );

    if (!memorialIds.length) {
      return new Map<string, string | null>();
    }

    const memorials = await this.prisma.memorial.findMany({
      where: { id: { in: memorialIds } },
      select: { id: true, displayName: true },
    });

    return new Map<string, string | null>(
      memorials.map((m) => [m.id, m.displayName ?? null]),
    );
  }

  private paginateActivityItems(
    items: FeedStatement[],
    limit: number,
    memorialNames?: Map<string, string | null>,
  ) {
    const deduped = Array.from(new Map(items.map((i) => [i.id, i])).values());
    const hasNext = deduped.length > limit;
    const slice = hasNext ? deduped.slice(0, limit) : deduped;
    return {
      items: slice.map((item) =>
        this.buildActivityFeedItemDto(
          item,
          item.memorialId
            ? (memorialNames?.get(item.memorialId) ?? null)
            : null,
        ),
      ),
      nextCursor: hasNext ? slice[slice.length - 1].id : null,
    };
  }

  private buildActivityFeedItemDto(
    item: FeedStatement,
    memorialDisplayName?: string | null,
  ): ActivityFeedItemDto {
    return {
      id: item.id,
      type: item.type,
      memorialId: item.memorialId,
      memorialDisplayName: memorialDisplayName ?? null,
      fundraisingId: item.fundraisingId,
      obituaryId: item.obituaryId,
      actorUserId: item.actorUserId,
      parts: item.parts ?? [],
      audienceTags: item.audienceTags ?? [],
      audienceUserIds: item.audienceUserIds ?? [],
      lat: item.lat,
      lng: item.lng,
      geoHash: item.geoHash,
      country: item.country,
      visibility: item.visibility,
      metadata: item.metadata,
      createdAt: item.createdAt,
    };
  }

  private computeGeoHash(lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }
    return `${lat.toFixed(this.geoHashPrecision)},${lng.toFixed(this.geoHashPrecision)}`;
  }

  private async getFollowedMemorialIds(userId: string): Promise<string[]> {
    const follows = await this.prisma.follow.findMany({
      where: { userId, targetType: FollowTargetType.MEMORIAL },
      select: { targetId: true },
      take: 500,
    });
    return follows.map((f) => f.targetId);
  }
}
