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
    // Validate post exists
    const post = await this.prisma.post.findUnique({
      where: { id: dto.targetId },
    });
    if (!post) throw new NotFoundException("Post not found");

    // Check for existing like
    const existing = await this.prisma.like.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: dto.targetType as LikeTargetType,
          targetId: dto.targetId,
        },
      },
    });

    if (existing) {
      // Unlike (idempotent delete)
      await this.prisma.like.delete({ where: { id: existing.id } });
      await this.updatePostMetrics(dto.targetId, { likes: -1 });
      await this.auditService.record({
        subjectType: "Like",
        subjectId: existing.id,
        actorUserId: userId,
        action: "DELETE",
        payload: { postId: dto.targetId },
      });
      return this.mapLikeToResponse(existing);
    }

    // Create new like
    const like = await this.prisma.like.create({
      data: {
        userId,
        targetType: dto.targetType as LikeTargetType,
        targetId: dto.targetId,
      },
    });

    await this.updatePostMetrics(dto.targetId, { likes: 1 });
    await this.auditService.record({
      subjectType: "Like",
      subjectId: like.id,
      actorUserId: userId,
      action: "CREATE",
      payload: { postId: dto.targetId },
    });

    return this.mapLikeToResponse(like);
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
      },
    });

    await this.auditService.record({
      subjectType: "Comment",
      subjectId: comment.id,
      actorUserId: userId,
      action: "CREATE",
      payload: { postId: dto.targetId, body: dto.body.substring(0, 100) },
    });

    return this.mapCommentToResponse(comment);
  }

  async getComments(postId: string, limit = 20): Promise<CommentResponseDto[]> {
    const comments = await this.prisma.comment.findMany({
      where: { targetId: postId, targetType: "POST", status: "VISIBLE" },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });

    return comments.map((c) => this.mapCommentToResponse(c));
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

  private mapCommentToResponse(comment: Comment): CommentResponseDto {
    return {
      id: comment.id,
      authorUserId: comment.authorUserId,
      targetType: comment.targetType,
      targetId: comment.targetId,
      body: comment.body,
      status: comment.status,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }
}
