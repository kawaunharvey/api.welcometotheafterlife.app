import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DecoratorStatus,
  DecoratorType,
  Prisma,
  Visibility,
} from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import {
  ApplyMemorialDecoratorDto,
  CreateDecoratorDto,
  DecoratorQueryDto,
  DecoratorResponseDto,
  DecoratorSortField,
  MemorialDecoratorResponseDto,
  PaginatedDecoratorsResponseDto,
  SortOrder,
  UpdateDecoratorDto,
  UpdateMemorialDecoratorDto,
} from "./dto/decorator.dto";
import {
  assertMemorialOwnerOrAdmin,
  isMemorialOwnerOrAdmin,
} from "@/common/utils/permissions";

const PRIMARY_DECORATOR_TYPES: DecoratorType[] = [
  DecoratorType.THEME,
  DecoratorType.BACKGROUND,
];

@Injectable()
export class DecoratorService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateDecoratorDto,
    userId: string,
  ): Promise<DecoratorResponseDto> {
    this.validateTagsAndCategories(dto.tags, dto.categories);

    const decorator = await this.prisma.decorator.create({
      data: {
        type: dto.type,
        label: dto.label,
        description: dto.description,
        categories: dto.categories ?? [],
        tags: dto.tags ?? [],
        status: dto.status ?? DecoratorStatus.ACTIVE,
        visibility: dto.visibility ?? Visibility.PUBLIC,
        textValue: dto.textValue,
        assetUrl: dto.assetUrl,
        assetType: dto.assetType,
        assetId: dto.assetId,
        thumbnailUrl: dto.thumbnailUrl,
        metadata:
          dto.metadata === undefined
            ? undefined
            : (dto.metadata as Prisma.InputJsonValue | null),
        collectionId: dto.collectionId,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      include: { collection: true },
    });

    return this.mapDecorator(decorator);
  }

  async update(
    id: string,
    dto: UpdateDecoratorDto,
    userId: string,
  ): Promise<DecoratorResponseDto> {
    this.validateTagsAndCategories(dto.tags, dto.categories);

    const existing = await this.prisma.decorator.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Decorator not found");
    }

    const decorator = await this.prisma.decorator.update({
      where: { id },
      data: {
        ...dto,
        metadata:
          dto.metadata === undefined
            ? undefined
            : (dto.metadata as Prisma.InputJsonValue | null),
        updatedByUserId: userId,
      },
      include: { collection: true },
    });

    return this.mapDecorator(decorator);
  }

  async getById(id: string): Promise<DecoratorResponseDto> {
    const decorator = await this.prisma.decorator.findUnique({
      where: { id },
      include: { collection: true },
    });
    if (!decorator) {
      throw new NotFoundException("Decorator not found");
    }
    return this.mapDecorator(decorator);
  }

  async list(
    query: DecoratorQueryDto,
    currentUserId?: string,
  ): Promise<PaginatedDecoratorsResponseDto> {
    const where: Prisma.DecoratorWhereInput = { AND: [] };

    if (query.q?.trim()) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({
        OR: [
          { label: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
          { tags: { hasSome: [query.q] } },
          { categories: { hasSome: [query.q] } },
        ],
      });
    }

    if (query.type) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({ type: query.type });
    }

    if (query.status) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({
        status: query.status,
      });
    } else if (!query.includeHidden) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({
        status: DecoratorStatus.ACTIVE,
      });
    }

    if (query.visibility) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({
        visibility: query.visibility,
      });
    } else if (!query.includeHidden) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({
        visibility: Visibility.PUBLIC,
      });
    }

    if (query.categories?.length) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({
        categories: { hasSome: query.categories },
      });
    }

    if (query.tags?.length) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({
        tags: { hasSome: query.tags },
      });
    }

    if (query.collectionId) {
      (where.AND as Prisma.DecoratorWhereInput[]).push({
        collectionId: query.collectionId,
      });
    }

    if (query.includeHidden && !currentUserId) {
      throw new ForbiddenException(
        "Authentication required to view hidden items",
      );
    }

    const take = Math.min(query.limit ?? 20, 50);
    const orderBy = this.resolveOrderBy(
      query.sortBy ?? DecoratorSortField.CREATED_AT,
      query.sortOrder ?? SortOrder.DESC,
    );

    const items = await this.prisma.decorator.findMany({
      where,
      orderBy,
      take: take + 1,
      include: { collection: true },
      ...(query.cursor
        ? {
            skip: 1,
            cursor: { id: query.cursor },
          }
        : {}),
    });

    const hasNext = items.length > take;
    const sliced = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext ? sliced[sliced.length - 1].id : null;

    return {
      items: sliced.map((d) => this.mapDecorator(d)),
      pageInfo: {
        hasNext,
        nextCursor,
      },
    };
  }

  async listByMemorial(
    memorialId: string,
    currentUserId?: string,
  ): Promise<MemorialDecoratorResponseDto[]> {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
    });
    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    if (
      memorial.visibility !== Visibility.PUBLIC &&
      !isMemorialOwnerOrAdmin(currentUserId ?? "", memorial)
    ) {
      throw new ForbiddenException(
        "Not authorized to view decorators for this memorial",
      );
    }

    const items = await this.prisma.memorialDecorator.findMany({
      where: { memorialId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { decorator: { include: { collection: true } } },
    });

    return items.map((item) => this.mapMemorialDecorator(item));
  }

  async applyToMemorial(
    memorialId: string,
    dto: ApplyMemorialDecoratorDto,
    userId: string,
  ): Promise<MemorialDecoratorResponseDto> {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
    });
    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    assertMemorialOwnerOrAdmin(userId, memorial);

    const decorator = await this.prisma.decorator.findUnique({
      where: { id: dto.decoratorId },
      include: { collection: true },
    });
    if (!decorator) {
      throw new NotFoundException("Decorator not found");
    }

    if (decorator.status !== DecoratorStatus.ACTIVE) {
      throw new BadRequestException("Decorator is not active");
    }

    if (decorator.visibility !== Visibility.PUBLIC && !userId) {
      throw new ForbiddenException("Decorator is not publicly available");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary && PRIMARY_DECORATOR_TYPES.includes(decorator.type)) {
        await tx.memorialDecorator.updateMany({
          where: {
            memorialId,
            decorator: { type: decorator.type },
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }

      const record = await tx.memorialDecorator.create({
        data: {
          memorialId,
          decoratorId: dto.decoratorId,
          appliedByUserId: userId,
          order: dto.order ?? 0,
          isPrimary: dto.isPrimary ?? false,
          variant:
            dto.variant === undefined
              ? undefined
              : (dto.variant as Prisma.InputJsonValue | null),
          effectiveFrom: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : undefined,
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : undefined,
        },
        include: { decorator: { include: { collection: true } } },
      });

      await tx.decorator.update({
        where: { id: dto.decoratorId },
        data: {
          usageCount: { increment: 1 },
          updatedByUserId: userId,
        },
      });

      return record;
    });

    return this.mapMemorialDecorator(created);
  }

  async updateMemorialDecorator(
    memorialDecoratorId: string,
    dto: UpdateMemorialDecoratorDto,
    userId: string,
  ): Promise<MemorialDecoratorResponseDto> {
    const existing = await this.prisma.memorialDecorator.findUnique({
      where: { id: memorialDecoratorId },
      include: { decorator: { include: { collection: true } }, memorial: true },
    });

    if (!existing) {
      throw new NotFoundException("Memorial decorator not found");
    }

    assertMemorialOwnerOrAdmin(userId, existing.memorial);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        dto.isPrimary &&
        PRIMARY_DECORATOR_TYPES.includes(existing.decorator.type)
      ) {
        await tx.memorialDecorator.updateMany({
          where: {
            memorialId: existing.memorialId,
            decorator: { type: existing.decorator.type },
            isPrimary: true,
            NOT: { id: memorialDecoratorId },
          },
          data: { isPrimary: false },
        });
      }

      return tx.memorialDecorator.update({
        where: { id: memorialDecoratorId },
        data: {
          order: dto.order ?? existing.order,
          isPrimary: dto.isPrimary ?? existing.isPrimary,
          variant:
            dto.variant === undefined
              ? existing.variant
              : (dto.variant as Prisma.InputJsonValue | null),
          effectiveFrom: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : existing.effectiveFrom,
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : existing.effectiveUntil,
        },
        include: { decorator: { include: { collection: true } } },
      });
    });

    return this.mapMemorialDecorator(updated);
  }

  async removeMemorialDecorator(
    memorialDecoratorId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.prisma.memorialDecorator.findUnique({
      where: { id: memorialDecoratorId },
      include: { memorial: true },
    });

    if (!existing) {
      throw new NotFoundException("Memorial decorator not found");
    }

    assertMemorialOwnerOrAdmin(userId, existing.memorial);

    await this.prisma.$transaction(async (tx) => {
      await tx.memorialDecorator.delete({ where: { id: memorialDecoratorId } });

      await tx.decorator.update({
        where: { id: existing.decoratorId },
        data: {
          usageCount: { decrement: 1 },
          updatedByUserId: userId,
        },
      });
    });
  }

  private validateTagsAndCategories(tags?: string[], categories?: string[]) {
    const validateList = (list?: string[], label = "items") => {
      if (!list) return;
      if (list.length > 25) {
        throw new BadRequestException(`Maximum 25 ${label} allowed`);
      }
      if (list.some((item) => item.length > 50)) {
        throw new BadRequestException(
          `Each ${label.slice(0, -1)} must be max 50 characters`,
        );
      }
    };

    validateList(tags, "tags");
    validateList(categories, "categories");
  }

  private resolveOrderBy(
    sortBy: DecoratorSortField,
    sortOrder: SortOrder,
  ): Prisma.DecoratorOrderByWithRelationInput {
    const order = sortOrder ?? SortOrder.DESC;
    switch (sortBy) {
      case DecoratorSortField.UPDATED_AT:
        return { updatedAt: order };
      case DecoratorSortField.USAGE_COUNT:
        return { usageCount: order };
      case DecoratorSortField.CREATED_AT:
      default:
        return { createdAt: order };
    }
  }

  private mapDecorator(model: any): DecoratorResponseDto {
    const {
      id,
      type,
      label,
      description,
      categories,
      tags,
      status,
      visibility,
      textValue,
      assetUrl,
      assetType,
      assetId,
      thumbnailUrl,
      metadata,
      collectionId,
      collection,
      usageCount,
      createdAt,
      updatedAt,
      createdByUserId,
      updatedByUserId,
    } = model;

    return {
      id,
      type,
      label,
      description,
      categories,
      tags,
      status,
      visibility,
      textValue,
      assetUrl,
      assetType,
      assetId,
      thumbnailUrl,
      metadata: metadata as Record<string, unknown> | null,
      collectionId,
      collectionLabel: collection?.label ?? null,
      collectionSlug: collection?.slug ?? null,
      usageCount,
      createdAt,
      updatedAt,
      createdByUserId,
      updatedByUserId,
    };
  }

  private mapMemorialDecorator(record: any): MemorialDecoratorResponseDto {
    return {
      id: record.id,
      memorialId: record.memorialId,
      decorator: this.mapDecorator(record.decorator),
      order: record.order,
      isPrimary: record.isPrimary,
      variant: record.variant as Record<string, unknown> | null,
      effectiveFrom: record.effectiveFrom,
      effectiveUntil: record.effectiveUntil,
      appliedByUserId: record.appliedByUserId ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
