import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  CreateLikeDto,
  LikeResponseDto,
  CreateCommentDto,
  CommentResponseDto,
  ListCommentsQueryDto,
  PaginatedCommentsResponseDto,
  LikeStatusQueryDto,
  LikeStatusResponseDto,
} from "./dto/interaction.dto";
import {
  LikeTargetType,
  CommentTargetType,
  Like,
  Comment,
} from "@prisma/client";

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger("InteractionsService");

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async toggleLike(
    userId: string,
    dto: CreateLikeDto,
  ): Promise<LikeResponseDto> {
    // Validate target exists based on type
    if (dto.targetType === LikeTargetType.POST) {
      const post = await this.prisma.post.findUnique({
        where: { id: dto.targetId },
      });
      if (!post) throw new NotFoundException("Post not found");
    } else if (dto.targetType === LikeTargetType.COMMENT) {
      const comment = await this.prisma.comment.findUnique({
        where: { id: dto.targetId },
      });
      if (!comment) throw new NotFoundException("Comment not found");
      if (comment.status === "REMOVED") {
        throw new BadRequestException("Cannot like a removed comment");
      }
    } else {
      throw new BadRequestException("Unsupported like target type");
    }

    // Check for existing like
    const existing = await this.prisma.like.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
    });

    if (existing) {
      // Unlike (idempotent delete)
      await this.prisma.like.delete({ where: { id: existing.id } });
      if (dto.targetType === LikeTargetType.POST) {
        await this.updatePostMetrics(dto.targetId, { likes: -1 });
      }
      await this.auditService.record({
        subjectType: "Like",
        subjectId: existing.id,
        actorUserId: userId,
        action: "DELETE",
        payload: { targetType: dto.targetType, targetId: dto.targetId },
      });
      return this.mapLikeToResponse(existing);
    }

    // Create new like
    const like = await this.prisma.like.create({
      data: {
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
    });

    if (dto.targetType === LikeTargetType.POST) {
      await this.updatePostMetrics(dto.targetId, { likes: 1 });
    }
    await this.auditService.record({
      subjectType: "Like",
      subjectId: like.id,
      actorUserId: userId,
      action: "CREATE",
      payload: { targetType: dto.targetType, targetId: dto.targetId },
    });

    return this.mapLikeToResponse(like);
  }

  async getLikeStatus(
    userId: string,
    query: LikeStatusQueryDto,
  ): Promise<LikeStatusResponseDto> {
    // Reuse validation logic
    if (query.targetType === LikeTargetType.POST) {
      const post = await this.prisma.post.findUnique({
        where: { id: query.targetId },
      });
      if (!post) throw new NotFoundException("Post not found");
    } else if (query.targetType === LikeTargetType.COMMENT) {
      const comment = await this.prisma.comment.findUnique({
        where: { id: query.targetId },
      });
      if (!comment) throw new NotFoundException("Comment not found");
      if (comment.status === "REMOVED") {
        throw new BadRequestException("Comment is removed");
      }
    } else {
      throw new BadRequestException("Unsupported like target type");
    }

    const [liked, count] = await Promise.all([
      this.prisma.like.findUnique({
        where: {
          userId_targetType_targetId: {
            userId,
            targetType: query.targetType,
            targetId: query.targetId,
          },
        },
      }),
      this.prisma.like.count({
        where: { targetType: query.targetType, targetId: query.targetId },
      }),
    ]);

    return {
      liked: Boolean(liked),
      count,
    };
  }

  async createComment(
    userId: string,
    dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    // Validate post exists
    const post = await this.prisma.post.findUnique({
      where: { id: dto.targetId },
    });
    if (!post) throw new NotFoundException("Post not found");

    let parentComment: Comment | null = null;
    if (dto.parentCommentId) {
      parentComment = await this.prisma.comment.findUnique({
        where: { id: dto.parentCommentId },
      });
      if (!parentComment)
        throw new NotFoundException("Parent comment not found");
      if (parentComment.targetId !== dto.targetId) {
        throw new BadRequestException(
          "Parent comment does not belong to this post",
        );
      }
      if (parentComment.status === "REMOVED") {
        throw new BadRequestException("Cannot reply to a removed comment");
      }
    }

    if (!dto.body || dto.body.trim().length === 0) {
      throw new BadRequestException("Comment body cannot be empty");
    }

    const comment = await this.prisma.comment.create({
      data: {
        authorUserId: userId,
        targetType: dto.targetType as CommentTargetType,
        targetId: dto.targetId,
        body: dto.body,
        status: "VISIBLE",
        parentCommentId: dto.parentCommentId,
      },
      include: {
        author: { select: { handle: true, imageUrl: true } },
      },
    });

    await this.auditService.record({
      subjectType: "Comment",
      subjectId: comment.id,
      actorUserId: userId,
      action: "CREATE",
      payload: {
        postId: dto.targetId,
        parentCommentId: dto.parentCommentId,
        body: dto.body.substring(0, 100),
      },
    });

    return this.mapCommentToResponse(comment, 0);
  }

  async getComments(
    postId: string,
    query: ListCommentsQueryDto,
  ): Promise<PaginatedCommentsResponseDto> {
    const take = Math.min(query.limit ?? 20, 100);

    const comments = await this.prisma.comment.findMany({
      where: { targetId: postId, targetType: "POST", status: "VISIBLE" },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      include: {
        author: { select: { handle: true, imageUrl: true } },
      },
    });

    const hasMore = comments.length > take;
    const items = hasMore ? comments.slice(0, take) : comments;
    const nextCursor = hasMore ? comments[take].id : undefined;

    const replyCounts = await Promise.all(
      items.map((c) =>
        this.prisma.comment.count({
          where: { parentCommentId: c.id, status: "VISIBLE" },
        }),
      ),
    );

    return {
      items: items.map((c, idx) =>
        this.mapCommentToResponse(c, replyCounts[idx] ?? 0),
      ),
      hasMore,
      nextCursor,
    };
  }

  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException("Comment not found");
    if (comment.authorUserId !== userId)
      throw new ForbiddenException("Only the author can delete this comment");

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { status: "REMOVED" },
    });

    await this.auditService.record({
      subjectType: "Comment",
      subjectId: commentId,
      actorUserId: userId,
      action: "DELETE",
    });
  }

  private async updatePostMetrics(
    postId: string,
    delta: Record<string, number>,
  ): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) return;

    const metrics = (post.metrics || {}) as Record<string, number>;
    const updated = { ...metrics };

    for (const [key, val] of Object.entries(delta)) {
      updated[key] = (updated[key] ?? 0) + val;
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { metrics: updated },
    });
  }

  private mapLikeToResponse(like: Like): LikeResponseDto {
    return {
      id: like.id,
      userId: like.userId,
      targetType: like.targetType,
      targetId: like.targetId,
      createdAt: like.createdAt.toISOString(),
    };
  }

  private mapCommentToResponse(
    comment: Comment & {
      author?: { handle: string | null; imageUrl: string | null };
    },
    replyCount = 0,
  ): CommentResponseDto {
    return {
      id: comment.id,
      authorUserId: comment.authorUserId,
      authorHandle: comment.author?.handle ?? undefined,
      authorImageUrl: comment.author?.imageUrl ?? undefined,
      targetType: comment.targetType,
      targetId: comment.targetId,
      body: comment.body,
      status: comment.status,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      parentCommentId: comment.parentCommentId ?? undefined,
      replyCount,
    };
  }
}
