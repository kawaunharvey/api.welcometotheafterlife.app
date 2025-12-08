import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFollowDto, FollowResponseDto } from "./dto/follow.dto";
import { FollowTargetType } from "@prisma/client";

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);
  constructor(private prisma: PrismaService) {}

  /**
   * Follow a memorial or creator (idempotent).
   */
  async follow(
    userId: string,
    dto: CreateFollowDto,
  ): Promise<FollowResponseDto> {
    // Check if already following
    const existing = await this.prisma.follow.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
    });

    if (existing) {
      // Return existing follow (idempotent)
      return this.mapToResponse(existing);
    }

    // Validate target exists (simplified check)
    if (dto.targetType === "MEMORIAL") {
      const memorial = await this.prisma.memorial.findUnique({
        where: { id: dto.targetId },
      });
      if (!memorial) {
        throw new NotFoundException("Memorial not found");
      }
    }

    const follow = await this.prisma.follow.create({
      data: {
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
    });

    return this.mapToResponse(follow);
  }

  /**
   * Unfollow a memorial or creator.
   */
  async unfollow(
    userId: string,
    targetType: FollowTargetType,
    targetId: string,
  ): Promise<void> {
    const follow = await this.prisma.follow.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType,
          targetId,
        },
      },
    });

    if (!follow) {
      throw new NotFoundException("Follow not found");
    }

    await this.prisma.follow.delete({
      where: { id: follow.id },
    });
  }

  /**
   * Check if user is following a target.
   */
  async isFollowing(
    userId: string,
    targetType: FollowTargetType,
    targetId: string,
  ): Promise<boolean> {
    const follow = await this.prisma.follow.findUnique({
      where: {
        userId_targetType_targetId: {
          userId,
          targetType,
          targetId,
        },
      },
    });
    return !!follow;
  }

  /**
   * Get user's follows.
   */
  async getUserFollows(userId: string) {
    return this.prisma.follow.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /**
   * Map Prisma Follow to response DTO.
   */
  private mapToResponse(follow: {
    id: string;
    userId: string;
    targetType: FollowTargetType;
    targetId: string;
    createdAt: Date;
  }): FollowResponseDto {
    return {
      id: follow.id,
      userId: follow.userId,
      targetType: follow.targetType,
      targetId: follow.targetId,
      createdAt: follow.createdAt,
    };
  }
}
