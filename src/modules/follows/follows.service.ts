import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFollowDto, FollowResponseDto } from "./dto/follow.dto";
import { FollowTargetType, MemorialRelationshipKind } from "@prisma/client";

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
    const isMemorialTarget = dto.targetType === FollowTargetType.MEMORIAL;
    const relationshipInput = dto.relationship ?? null;
    const qualifierInput = dto.qualifier
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0);

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
      // If relationship provided while already following a memorial, upsert it
      const relationship = isMemorialTarget
        ? await this.upsertMemorialRelationship(
            userId,
            dto.targetId,
            relationshipInput,
            qualifierInput,
          )
        : null;

      // Return existing follow (idempotent)
      return this.mapToResponse(
        existing,
        relationship?.relationship,
        relationship?.qualifier,
      );
    }

    // Validate target exists (simplified check)
    if (isMemorialTarget) {
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

    const relationship = isMemorialTarget
      ? await this.upsertMemorialRelationship(
          userId,
          dto.targetId,
          relationshipInput,
          qualifierInput,
        )
      : null;

    return this.mapToResponse(
      follow,
      relationship?.relationship,
      relationship?.qualifier,
    );
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

    if (targetType === FollowTargetType.MEMORIAL) {
      await this.prisma.memorialRelationship.deleteMany({
        where: { memorialId: targetId, userId },
      });
    }
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
  private mapToResponse(
    follow: {
      id: string;
      userId: string;
      targetType: FollowTargetType;
      targetId: string;
      createdAt: Date;
    },
    relationship?: MemorialRelationshipKind | null,
    qualifier?: string[] | null,
  ): FollowResponseDto {
    return {
      id: follow.id,
      userId: follow.userId,
      targetType: follow.targetType,
      targetId: follow.targetId,
      createdAt: follow.createdAt,
      relationship: relationship ?? null,
      qualifier: qualifier ?? [],
    };
  }

  /**
   * Upsert the memorial relationship if provided, otherwise return existing.
   */
  private async upsertMemorialRelationship(
    userId: string,
    memorialId: string,
    relationship?: MemorialRelationshipKind | null,
    qualifier?: string[] | null,
  ): Promise<{
    relationship: MemorialRelationshipKind;
    qualifier: string[];
  } | null> {
    const cleanedQualifier = qualifier
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0);

    const existing = await this.prisma.memorialRelationship.findUnique({
      where: {
        memorialId_userId: { memorialId, userId },
      },
    });

    const relationshipToUse = relationship ?? existing?.relationship ?? null;

    // Cannot create a new relationship record without a relationship kind
    if (!relationshipToUse && cleanedQualifier?.length && !existing) {
      return null;
    }

    // If there's nothing to change or create, return existing snapshot (or null).
    if (!relationshipToUse && !cleanedQualifier?.length) {
      if (!existing) {
        return null;
      }

      return {
        relationship: existing.relationship,
        qualifier: existing.qualifier ?? [],
      };
    }

    const saved = await this.prisma.memorialRelationship.upsert({
      where: {
        memorialId_userId: { memorialId, userId },
      },
      update: {
        ...(relationshipToUse ? { relationship: relationshipToUse } : {}),
        qualifier: cleanedQualifier ?? existing?.qualifier ?? [],
      },
      create: {
        memorialId,
        userId,
        relationship: relationshipToUse as MemorialRelationshipKind,
        qualifier: cleanedQualifier ?? [],
      },
    });

    return {
      relationship: saved.relationship,
      qualifier: saved.qualifier ?? [],
    };
  }
}
