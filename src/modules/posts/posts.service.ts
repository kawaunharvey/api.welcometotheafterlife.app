import {
  Injectable,
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
import { PostStatus, Visibility, Post, Memorial } from "@prisma/client";

@Injectable()
export class PostsService {
  private readonly logger = new Logger("PostsService");

  constructor(
    private prisma: PrismaService,
    private feedsService: FeedsService,
    private auditService: AuditService,
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

    const post = await this.prisma.post.create({
      data: {
        authorUserId: userId,
        memorialId: dto.memorialId,
        caption: dto.caption,
        tags: dto.tags || [],
        visibility: dto.visibility || Visibility.PUBLIC,
        baseMedia: {
          url: dto.baseMedia.url,
          assetId: dto.baseMedia.assetId,
          mediaType: dto.baseMedia.mediaType,
        },
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
        caption: dto.caption ?? post.caption,
        tags: dto.tags ?? post.tags,
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

  private mapToResponse(post: Post): PostResponseDto {
    const metrics = post.metrics as Record<string, number>;
    return {
      id: post.id,
      authorUserId: post.authorUserId || "",
      memorialId: post.memorialId || "",
      caption: post.caption ?? undefined,
      tags: post.tags,
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
