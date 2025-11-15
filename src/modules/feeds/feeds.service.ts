import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FeedType, FeedStatus, PostStatus } from "@prisma/client";
import * as crypto from "crypto";

export interface FeedEntryWithPost {
  id: string;
  publishedAt: Date;
  score: number | null;
  reasons: string[];
  post: {
    id: string;
    type: string;
    title: string | null;
    caption: string | null;
    composition: unknown;
    assetRefs: string[];
    tags: string[];
    categories: string[];
    visibility: string;
    status: string;
    publishedAt: Date | null;
    metrics: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
}

@Injectable()
export class FeedsService {
  private readonly logger = new Logger("FeedsService");

  constructor(private prisma: PrismaService) {}

  /**
   * Ensure a memorial feed exists; create if not.
   */
  async ensureMemorialFeed(memorialId: string) {
    const feedKey = this.generateFeedKey("MEMORIAL", memorialId);

    const feed = await this.prisma.feed.findUnique({
      where: { feedKey },
    });

    if (feed) {
      return feed;
    }

    return this.prisma.feed.create({
      data: {
        type: FeedType.MEMORIAL,
        memorialId,
        feedKey,
        status: FeedStatus.ACTIVE,
      },
    });
  }

  /**
   * Get feed by memorial ID.
   */
  async getFeedByMemorial(memorialId: string) {
    return this.prisma.feed.findFirst({
      where: {
        memorialId,
        type: FeedType.MEMORIAL,
      },
    });
  }

  /**
   * Get feed by ID.
   */
  async getFeedById(feedId: string) {
    return this.prisma.feed.findUnique({
      where: { id: feedId },
    });
  }

  /**
   * Add a post entry to the memorial's feed.
   */
  async addEntryForMemorialPost(
    memorialId: string,
    postId: string,
    reasons: string[],
  ) {
    // Ensure memorial feed exists
    const feed = await this.ensureMemorialFeed(memorialId);

    // Create feed entry
    return this.prisma.feedEntry.create({
      data: {
        feedId: feed.id,
        postId,
        publishedAt: new Date(),
        score: 1.0, // Baseline score
        reasons,
      },
    });
  }

  /**
   * Get paginated feed entries for a memorial with hydrated posts.
   */
  async getMemorialFeedEntries(
    memorialId: string,
    {
      limit = 20,
      cursor,
    }: {
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<FeedEntryWithPost[]> {
    // Ensure feed exists
    const feed = await this.ensureMemorialFeed(memorialId);

    const entries = await this.prisma.feedEntry.findMany({
      where: {
        feedId: feed.id,
        post: {
          status: PostStatus.PUBLISHED,
        },
      },
      include: {
        post: true,
      },
      orderBy: { publishedAt: "desc" },
      take: Math.min(limit, 100),
      skip: cursor ? 1 : 0,
    });

    return entries as FeedEntryWithPost[];
  }

  /**
   * Rebuild feed entries for a memorial from recent published posts.
   */
  async rebuildMemorialFeed(memorialId: string) {
    const feed = await this.ensureMemorialFeed(memorialId);

    // Clear existing entries
    await this.prisma.feedEntry.deleteMany({
      where: { feedId: feed.id },
    });

    // Get recent published posts for this memorial
    const posts = await this.prisma.post.findMany({
      where: {
        memorialId,
        status: PostStatus.PUBLISHED,
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });

    // Create new entries
    for (const post of posts) {
      await this.prisma.feedEntry.create({
        data: {
          feedId: feed.id,
          postId: post.id,
          publishedAt: post.publishedAt || new Date(),
          score: 1.0,
          reasons: ["REBUILT"],
        },
      });
    }

    this.logger.log(
      `Rebuilt feed for memorial ${memorialId} with ${posts.length} posts`,
    );
  }

  /**
   * Generate a deterministic feed key from scope.
   */
  private generateFeedKey(type: string, id: string): string {
    const input = `${type}:${id}`;
    return crypto.createHash("sha1").update(input).digest("hex");
  }
}
