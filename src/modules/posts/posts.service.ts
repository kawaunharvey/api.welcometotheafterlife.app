import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { FeedsService } from "../feeds/feeds.service";
import { AuditService } from "../audit/audit.service";
import {
  CreatePostDto,
  UpdatePostDto,
  PostResponseDto,
  ListPostsQueryDto,
} from "./dto/post.dto";
import { ContentServiceClient } from "../../common/http-client/content-service.client";
import { PostStatus, Visibility, Post, Memorial } from "@prisma/client";

@Injectable()
export class PostsService {
  private readonly logger = new Logger("PostsService");

  constructor(
    private prisma: PrismaService,
    private feedsService: FeedsService,
    private auditService: AuditService,
    private contentServiceClient: ContentServiceClient,
  ) {}

  async createTributePost(
    userId: string,
    dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    let memorial: Memorial | null = null;
    if (dto.memorialId) {
      memorial = await this.prisma.memorial.findUnique({
        where: { id: dto.memorialId },
      });
      if (!memorial) throw new NotFoundException("Memorial not found");
      if (
        memorial.visibility !== Visibility.PUBLIC &&
        memorial.ownerUserId !== userId
      ) {
        throw new ForbiddenException(
          "You do not have permission to post to this memorial",
        );
      }
    }

    if (dto.composition) {
      if (dto.composition.baseMedia) {
        const baseMedia = dto.composition.baseMedia;
        if (
          ["image", "video"].includes(baseMedia.type) &&
          !baseMedia.assetId &&
          !baseMedia.url
        ) {
          throw new BadRequestException(
            `Base media of type ${baseMedia.type} must have an assetId or url`,
          );
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const post = await this.prisma.post.create({
      data: {
        type: "TRIBUTE",
        authorUserId: userId,
        memorialId: dto.memorialId,
        title: dto.title,
        caption: dto.caption,
        composition: dto.composition || null,
        assetRefs: dto.assetRefs || [],
        tags: dto.tags || [],
        categories: dto.categories || [],
        visibility: dto.visibility || Visibility.PUBLIC,
        status: dto.status || PostStatus.DRAFT,
        publishedAt: dto.status === PostStatus.PUBLISHED ? new Date() : null,
        metrics: {
          impressions: 0,
          clicks: 0,
          watchTimeMs: 0,
          likes: 0,
          flags: 0,
        },
      },
    });

    if (post.status === PostStatus.PUBLISHED && memorial) {
      await this.feedsService.addEntryForMemorialPost(memorial.id, post.id, [
        "NEW_TRIBUTE",
      ]);
    }

    await this.auditService.record({
      subjectType: "Post",
      subjectId: post.id,
      actorUserId: userId,
      action: "CREATE_TRIBUTE",
      payload: { memorialId: memorial?.id, status: post.status },
    });

    if (dto.assetRefs && dto.assetRefs.length > 0) {
      this.fetchOcrAsync(post.id, dto.assetRefs).catch((err) =>
        this.logger.warn("OCR fetch failed", err),
      );
    }

    return this.mapToResponse(post);
  }

  async getPostById(
    postId: string,
    currentUserId?: string,
  ): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("Post not found");
    if (
      post.visibility === Visibility.PRIVATE &&
      post.authorUserId !== currentUserId
    ) {
      throw new ForbiddenException("Post is private");
    }
    return this.mapToResponse(post);
  }

  async updatePost(
    postId: string,
    userId: string,
    dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("Post not found");
    if (post.authorUserId !== userId)
      throw new ForbiddenException("Only the author can update this post");

    const wasPublished = post.status === PostStatus.PUBLISHED;
    const isPublishing = dto.status === PostStatus.PUBLISHED && !wasPublished;

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        title: dto.title ?? post.title,
        caption: dto.caption ?? post.caption,
        composition: dto.composition ?? post.composition,
        assetRefs: dto.assetRefs ?? post.assetRefs,
        tags: dto.tags ?? post.tags,
        categories: dto.categories ?? post.categories,
        visibility: dto.visibility ?? post.visibility,
        status: dto.status ?? post.status,
        publishedAt: isPublishing ? new Date() : post.publishedAt,
      },
    });

    if (isPublishing && post.memorialId) {
      await this.feedsService.addEntryForMemorialPost(
        post.memorialId,
        post.id,
        ["TRIBUTE_PUBLISHED"],
      );
    }

    await this.auditService.record({
      subjectType: "Post",
      subjectId: post.id,
      actorUserId: userId,
      action: "UPDATE",
      payload: { changes: dto },
    });

    return this.mapToResponse(updated);
  }

  async listPosts(query: ListPostsQueryDto): Promise<PostResponseDto[]> {
    const limit = Math.min(query.limit ?? 20, 100);
    const where: Record<string, unknown> = { status: PostStatus.PUBLISHED };

    if (query.memorialId) where.memorialId = query.memorialId;
    if (query.tags) {
      const tagArray = query.tags.split(",").map((t) => t.trim());
      where.tags = { hasSome: tagArray };
    }
    if (query.q) {
      where.OR = [
        { caption: { search: query.q } },
        { title: { search: query.q } },
        { body: { search: query.q } },
      ];
    }

    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: limit,
      skip: query.cursor ? 1 : 0,
    });

    return posts.map((post) => this.mapToResponse(post));
  }

  private async fetchOcrAsync(
    postId: string,
    assetIds: string[],
  ): Promise<void> {
    try {
      for (const assetId of assetIds) {
        try {
          await this.contentServiceClient.getAsset(assetId);
        } catch (err) {
          this.logger.debug(`Could not fetch OCR for asset ${assetId}`, err);
        }
      }
    } catch (err) {
      this.logger.warn("Failed to fetch OCR text", err);
    }
  }

  private mapToResponse(post: Post): PostResponseDto {
    const metrics = post.metrics as Record<string, number>;
    return {
      id: post.id,
      type: post.type,
      authorUserId: post.authorUserId || "",
      memorialId: post.memorialId || "",
      title: post.title ?? undefined,
      caption: post.caption ?? undefined,
      composition:
        (post.composition as Record<string, unknown> | null) || undefined,
      assetRefs: post.assetRefs,
      tags: post.tags,
      categories: post.categories,
      visibility: post.visibility,
      status: post.status,
      publishedAt: post.publishedAt?.toISOString(),
      metrics: {
        impressions: (metrics?.impressions ?? 0) as number,
        clicks: (metrics?.clicks ?? 0) as number,
        watchTimeMs: (metrics?.watchTimeMs ?? 0) as number,
        likes: (metrics?.likes ?? 0) as number,
        flags: (metrics?.flags ?? 0) as number,
      },
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }
}
