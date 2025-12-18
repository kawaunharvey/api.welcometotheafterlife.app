import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateMemorialDto,
  UpdateMemorialDto,
  MemorialResponseDto,
} from "./dto/memorial.dto";
import {
  Visibility,
  MemorialStatus,
  FeedItemType,
  Prisma,
} from "@prisma/client";
import { FeedsService } from "../feeds/feeds.service";
import { AuditService } from "../audit/audit.service";
import { ContentServiceClient } from "../../common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MemorialsService {
  private readonly logger = new Logger(MemorialsService.name);

  constructor(
    private prisma: PrismaService,
    private feedsService: FeedsService,
    private auditService: AuditService,
    private contentService: ContentServiceClient,
    private configService: ConfigService,
  ) {}

  /**
   * Create a new memorial.
   */
  async create(
    dto: CreateMemorialDto,
    userId: string,
  ): Promise<MemorialResponseDto> {
    // Validate tags
    if (dto.tags && dto.tags.length > 25) {
      throw new BadRequestException("Maximum 25 tags allowed");
    }
    if (dto.tags?.some((tag) => tag.length > 30)) {
      throw new BadRequestException("Each tag must be max 30 characters");
    }

    // Check slug uniqueness
    const existingMemorial = await this.prisma.memorial.findUnique({
      where: { slug: dto.slug },
    });
    if (existingMemorial) {
      throw new ConflictException("Slug already exists");
    }

    let location: { create: Prisma.LocationCreateInput } | undefined =
      undefined;
    if (
      dto.location &&
      typeof dto.location.lat === "number" &&
      typeof dto.location.lng === "number"
    ) {
      location = {
        create: {
          type: "AFTERLIFE",
          lat: dto.location.lat,
          lng: dto.location.lng,
          point: {
            type: "Point",
            coordinates: [dto.location.lng, dto.location.lat],
          },
        },
      };
    }

    // Create memorial
    const memorial = await this.prisma.memorial.create({
      data: {
        slug: dto.slug,
        displayName: dto.displayName,
        salutation: dto.salutation,
        yearOfBirth: dto.yearOfBirth,
        yearOfPassing: dto.yearOfPassing,
        bioSummary: dto.bioSummary,
        coverAssetId: dto.coverAssetId,
        coverAssetUrl: dto.coverAssetUrl,
        shortId: dto.shortId,
        tags: dto.tags ?? [],
        visibility: dto.visibility ?? Visibility.PUBLIC,
        ownerUserId: userId,
        theme: dto.theme,
        status: MemorialStatus.ACTIVE,
        location,
      },
      include: {
        location: true,
      },
    });

    console.log("Memorial created with ID:", memorial.id);

    await this.feedsService.createActivityFeedItem({
      type: FeedItemType.MEMORIAL_UPDATE,
      memorialId: memorial.id,
      actorUserId: userId,
      templatePayload: {
        actor: { id: userId },
        memorial: {
          id: memorial.id,
          displayName: memorial.displayName,
        },
        summary: dto.bioSummary ?? "Memorial created",
      },
      audienceTags: ["FOLLOWING", "MEMORIAL"],
      audienceUserIds: [userId],
      lat: memorial.location?.lat ?? undefined,
      lng: memorial.location?.lng ?? undefined,
      country: dto.location?.country ?? undefined,
      visibility: memorial.visibility,
    });

    console.log("Activity feed item created for memorial:", memorial.id);

    // Prime cache-backed feed for this memorial
    await this.rebuildMemorialFeedSafe(memorial.id);

    // Record audit log
    await this.auditService.record({
      subjectType: "Memorial",
      subjectId: memorial.id,
      actorUserId: userId,
      action: "CREATE",
      payload: { displayName: memorial.displayName },
    });

    return this.mapToResponse(memorial);
  }

  /**
   * Get memorial by ID.
   */
  async getById(
    id: string,
    currentUserId?: string,
  ): Promise<MemorialResponseDto> {
    this.logger.debug(
      `getById - fetch start id=${id} requester=${currentUserId ?? "anonymous"}`,
    );

    const [memorialData, postsCount] = await Promise.all([
      this.prisma.memorial.findUnique({
        where: { id },
        include: {
          location: true,
          fundraising: {
            select: {
              id: true,
              beneficiaryName: true,
              beneficiaryOnboardingStatus: true,
              beneficiaryExternalId: true,
            },
          },
        },
      }),
      this.prisma.post.count({ where: { memorialId: id } }),
    ]);

    let memorial = memorialData;

    if (!memorial) {
      // Detect common confusion: obituary IDs are not memorial IDs
      const memorialByObituaryId = await this.prisma.memorial.findFirst({
        where: { obituaryId: id },
        include: {
          location: true,
          fundraising: {
            select: {
              id: true,
              beneficiaryName: true,
              beneficiaryOnboardingStatus: true,
              beneficiaryExternalId: true,
            },
          },
        },
      });

      if (memorialByObituaryId) {
        this.logger.warn(
          `getById - id=${id} matches obituaryId; returning memorialId=${memorialByObituaryId.id} requester=${currentUserId ?? "anonymous"}`,
        );
        memorial = memorialByObituaryId;
      } else {
        this.logger.warn(
          `getById - not found id=${id} requester=${currentUserId ?? "anonymous"}`,
        );
        throw new NotFoundException("Memorial not found");
      }
    }

    this.logger.debug(
      `getById - Memorial ${id} fundraising data:`,
      memorial.fundraising,
    );

    // Check visibility
    if (
      memorial.visibility !== Visibility.PUBLIC &&
      memorial.ownerUserId !== currentUserId
    ) {
      this.logger.warn(
        `getById - forbidden id=${id} visibility=${memorial.visibility} owner=${memorial.ownerUserId} requester=${currentUserId ?? "anonymous"}`,
      );
      throw new ForbiddenException("Not authorized to view this memorial");
    }

    this.logger.log(
      `getById - success id=${id} visibility=${memorial.visibility} requester=${currentUserId ?? "anonymous"}`,
    );

    return this.mapToResponse(memorial, postsCount);
  }

  /**
   * Get memorial by slug.
   */
  async getBySlug(
    slug: string,
    currentUserId?: string,
  ): Promise<MemorialResponseDto> {
    const memorial = await this.prisma.memorial.findUnique({
      where: { slug },
      include: {
        location: true,
        fundraising: {
          select: {
            id: true,
            beneficiaryName: true,
            beneficiaryOnboardingStatus: true,
            beneficiaryExternalId: true,
          },
        },
      },
    });

    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    const postsCount = await this.prisma.post.count({
      where: { memorialId: memorial.id },
    });

    // Check visibility
    if (
      memorial.visibility !== Visibility.PUBLIC &&
      memorial.ownerUserId !== currentUserId
    ) {
      throw new ForbiddenException("Not authorized to view this memorial");
    }

    return this.mapToResponse(memorial, postsCount);
  }

  /**
   * List memorials with filters.
   */
  async list(
    query?: string,
    tags?: string[],
    currentUserId?: string,
  ): Promise<MemorialResponseDto[]> {
    const visibilityConditions: Array<
      { visibility: Visibility } | { ownerUserId: string }
    > = [{ visibility: Visibility.PUBLIC }];
    if (currentUserId) {
      visibilityConditions.push({ ownerUserId: currentUserId });
    }

    const andConditions: Record<string, unknown>[] = [
      { OR: visibilityConditions },
    ];

    // Search query
    if (query?.trim()) {
      andConditions.push({
        OR: [
          { displayName: { contains: query, mode: "insensitive" } },
          { bioSummary: { contains: query, mode: "insensitive" } },
        ],
      });
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      andConditions.push({
        tags: { hasSome: tags },
      });
    }

    const memorials = await this.prisma.memorial.findMany({
      where: { AND: andConditions } as never,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { location: true },
    });

    // Lightweight count per memorial; acceptable for <=100 results. If performance becomes an issue,
    // replace with aggregation.
    const counts = await Promise.all(
      memorials.map((m) =>
        this.prisma.post.count({ where: { memorialId: m.id } }),
      ),
    );

    return memorials.map((m, idx) => this.mapToResponse(m, counts[idx]));
  }

  /**
   * Update memorial (owner/admin only).
   */
  async update(
    id: string,
    dto: UpdateMemorialDto,
    currentUserId: string,
  ): Promise<MemorialResponseDto> {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id },
      include: { location: true },
    });

    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    // Check ownership
    if (memorial.ownerUserId !== currentUserId) {
      throw new ForbiddenException("Only owner can update this memorial");
    }

    // Validate tags
    if (dto.tags && dto.tags.length > 25) {
      throw new BadRequestException("Maximum 25 tags allowed");
    }
    if (dto.tags?.some((tag) => tag.length > 30)) {
      throw new BadRequestException("Each tag must be max 30 characters");
    }

    let locationId = memorial.locationId ?? null;
    if (dto.location) {
      if (locationId) {
        await this.prisma.location.update({
          where: { id: locationId },
          data: {
            googlePlaceId: dto.location.googlePlaceId ?? undefined,
            formattedAddress: dto.location.formattedAddress ?? undefined,
            lat: dto.location.lat ?? undefined,
            lng: dto.location.lng ?? undefined,
            city: dto.location.city ?? undefined,
            state: dto.location.state ?? undefined,
            country: dto.location.country ?? undefined,
          },
        });
      } else {
        const createdLocation = await this.prisma.location.create({
          data: {
            type: memorial.location ? memorial.location.type : "AFTERLIFE",
            googlePlaceId: dto.location.googlePlaceId ?? undefined,
            formattedAddress: dto.location.formattedAddress ?? undefined,
            lat: dto.location.lat ?? undefined,
            lng: dto.location.lng ?? undefined,
            city: dto.location.city ?? undefined,
            state: dto.location.state ?? undefined,
            country: dto.location.country ?? undefined,
          },
        });
        locationId = createdLocation.id;
      }
    }

    const updated = await this.prisma.memorial.update({
      where: { id },
      data: {
        displayName: dto.displayName ?? memorial.displayName,
        salutation: dto.salutation ?? memorial.salutation,
        yearOfBirth: dto.yearOfBirth ?? memorial.yearOfBirth,
        theme: dto.theme ?? memorial.theme,
        yearOfPassing: dto.yearOfPassing ?? memorial.yearOfPassing,
        bioSummary: dto.bioSummary ?? memorial.bioSummary,
        tags: dto.tags ?? memorial.tags,
        coverAssetId: dto.coverAssetId ?? memorial.coverAssetId,
        coverAssetUrl: dto.coverAssetUrl ?? memorial.coverAssetUrl,
        shortId: dto.shortId ?? memorial.shortId,
        visibility: dto.visibility ?? memorial.visibility,
        ...(locationId ? { locationId } : {}),
      },
      include: { location: true },
    });

    const postsCount = await this.prisma.post.count({
      where: { memorialId: id },
    });
    await this.feedsService.createActivityFeedItem({
      type: FeedItemType.MEMORIAL_UPDATE,
      memorialId: id,
      actorUserId: currentUserId,
      templatePayload: {
        actor: { id: currentUserId },
        memorial: {
          id: updated.id,
          displayName: updated.displayName,
        },
        summary: dto.bioSummary ?? "Memorial updated",
      },
      audienceTags: ["FOLLOWING", "MEMORIAL"],
      audienceUserIds: [memorial.ownerUserId],
      lat: updated.location?.lat ?? undefined,
      lng: updated.location?.lng ?? undefined,
      country: updated.location?.country ?? undefined,
      visibility: updated.visibility,
    });

    // Record audit log
    await this.auditService.record({
      subjectType: "Memorial",
      subjectId: id,
      actorUserId: currentUserId,
      action: "UPDATE",
      payload: dto,
    });

    return this.mapToResponse(updated, postsCount);
  }

  /**
   * Archive/unarchive a memorial.
   */
  async toggleArchive(
    id: string,
    currentUserId: string,
  ): Promise<MemorialResponseDto> {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id },
      include: { location: true },
    });

    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    // Check ownership
    if (memorial.ownerUserId !== currentUserId) {
      throw new ForbiddenException("Only owner can archive this memorial");
    }

    const isArchived = memorial.status === MemorialStatus.ARCHIVED;
    const updated = await this.prisma.memorial.update({
      where: { id },
      data: {
        status: isArchived ? MemorialStatus.ACTIVE : MemorialStatus.ARCHIVED,
        archivedAt: isArchived ? null : new Date(),
      },
      include: { location: true },
    });

    const postsCount = await this.prisma.post.count({
      where: { memorialId: id },
    });
    // Record audit log
    await this.auditService.record({
      subjectType: "Memorial",
      subjectId: id,
      actorUserId: currentUserId,
      action: isArchived ? "UNARCHIVE" : "ARCHIVE",
      payload: { status: updated.status },
    });

    return this.mapToResponse(updated, postsCount);
  }

  /**
   * Create an upload session for memorial images (cover photos, gallery images).
   */
  async createImageUploadSession(
    filename: string,
    mimeType: string,
    sizeBytes: number,
    userId: string,
    memorialId: string,
  ) {
    try {
      const session = await this.contentService.createMediaSession(
        filename,
        mimeType,
        sizeBytes,
        userId,
        `memorial:${memorialId}`,
      );

      // Record audit log for upload session creation
      await this.auditService.record({
        subjectType: "Memorial",
        subjectId: memorialId,
        actorUserId: userId,
        action: "UPLOAD_SESSION_CREATED",
        payload: {
          filename,
          mimeType,
          sizeBytes,
          sessionId: session.id,
        },
      });

      return session;
    } catch (error) {
      this.logger.error(
        `Failed to create image upload session for memorial ${memorialId}`,
        error,
      );
      throw new BadRequestException(
        "Failed to create upload session. Please check file type and size.",
      );
    }
  }

  /**
   * Create an upload session for memorial documents.
   */
  async createDocumentUploadSession(
    filename: string,
    mimeType: string,
    sizeBytes: number,
    userId: string,
    memorialId: string,
  ) {
    try {
      const session = await this.contentService.createDocumentSession(
        filename,
        mimeType,
        sizeBytes,
        userId,
        `memorial:${memorialId}`,
      );

      // Record audit log for upload session creation
      await this.auditService.record({
        subjectType: "Memorial",
        subjectId: memorialId,
        actorUserId: userId,
        action: "UPLOAD_SESSION_CREATED",
        payload: {
          filename,
          mimeType,
          sizeBytes,
          sessionId: session.id,
          type: "document",
        },
      });

      return session;
    } catch (error) {
      this.logger.error(
        `Failed to create document upload session for memorial ${memorialId}`,
        error,
      );
      throw new BadRequestException(
        "Failed to create upload session. Please check file type and size.",
      );
    }
  }

  /**
   * Complete an upload session and associate the asset with a memorial.
   */
  async completeUploadSession(
    sessionId: string,
    userId: string,
    memorialId: string,
    assetMeta?: Record<string, unknown>,
  ) {
    try {
      const asset = await this.contentService.completeSession(sessionId, {
        assetMeta: {
          ...assetMeta,
          memorialId,
          uploadedBy: userId,
        },
      });

      // Record audit log for completed upload
      await this.auditService.record({
        subjectType: "Memorial",
        subjectId: memorialId,
        actorUserId: userId,
        action: "ASSET_UPLOADED",
        payload: {
          assetId: asset.assetId,
          sessionId,
          filename: asset.objectName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
        },
      });

      return asset;
    } catch (error) {
      this.logger.error(
        `Failed to complete upload session ${sessionId} for memorial ${memorialId}`,
        error,
      );
      throw new BadRequestException("Failed to complete upload session.");
    }
  }

  /**
   * Map Prisma Memorial to response DTO.
   */
  private mapToResponse(
    memorial: {
      id: string;
      slug: string;
      shortId: string | null;
      ownerUserId: string;
      displayName: string;
      salutation: string | null;
      yearOfBirth: number | null;
      yearOfPassing: number | null;
      bioSummary: string | null;
      tags: string[];
      visibility: Visibility;
      createdAt: Date;
      theme: string | null;
      updatedAt: Date;
      archivedAt: Date | null;
      obituaryId?: string | null;
      obituaryServiceSessionId?: string | null;
      coverAssetUrl?: string | null;
      coverAssetId?: string | null;
      fundraising?: {
        id: string;
        beneficiaryName: string | null;
        beneficiaryOnboardingStatus: string | null;
        beneficiaryExternalId: string | null;
      } | null;
      location: {
        googlePlaceId?: string | null;
        formattedAddress?: string | null;
        lat?: number | null;
        lng?: number | null;
        city?: string | null;
        state?: string | null;
        country?: string | null;
      } | null;
    },
    postsCount?: number,
  ): MemorialResponseDto {
    return {
      id: memorial.id,
      slug: memorial.slug,
      displayName: memorial.displayName,
      salutation: memorial.salutation,
      yearOfBirth: memorial.yearOfBirth,
      yearOfPassing: memorial.yearOfPassing,
      location: memorial.location,
      bioSummary: memorial.bioSummary,
      tags: memorial.tags,
      visibility: memorial.visibility,
      ownerUserId: memorial.ownerUserId,
      createdAt: memorial.createdAt,
      updatedAt: memorial.updatedAt,
      archivedAt: memorial.archivedAt,
      fundraising: memorial.fundraising || undefined,
      obituaryId: memorial.obituaryId || null,
      coverAssetUrl: memorial.coverAssetUrl || null,
      coverAssetId: memorial.coverAssetId || null,
      obituaryServiceSessionId: memorial.obituaryServiceSessionId || null,
      theme: memorial.theme,
      postsCount: postsCount ?? 0,
      links: {
        iosAppUrl: `${this.configService.get("IOS_APP_SCHEMA")}://memorial/${memorial.id}`,
        androidAppUrl: `${this.configService.get("ANDROID_APP_SCHEMA")}://memorial/${memorial.id}`,
        webUrl: `${this.configService.get("SHARE_BASE_URL")}/memorial/${memorial.slug}`,
        shortUrl: `${this.configService.get("SHORT_URL_BASE")}/m/${memorial.shortId}`,
      },
    };
  }

  private async rebuildMemorialFeedSafe(memorialId: string) {
    try {
      await this.feedsService.rebuildMemorialFeed(memorialId);
    } catch (error) {
      this.logger.warn(
        `Failed to rebuild cached feed for memorial ${memorialId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ==================== Obituary Integration Methods ====================

  /**
   * Update memorial with obituary service session ID
   */
  async updateObituarySession(
    memorialId: string,
    sessionId: string,
  ): Promise<void> {
    await this.prisma.memorial.update({
      where: { id: memorialId },
      data: { obituaryServiceSessionId: sessionId },
    });

    // Log the update for auditing
    await this.auditService.record({
      subjectType: "Memorial",
      subjectId: memorialId,
      action: "obituary_session_updated",
      payload: { sessionId },
    });

    this.logger.debug(
      `Updated memorial ${memorialId} with obituary session ${sessionId}`,
    );
  }

  /**
   * Update memorial with obituary ID
   */
  async updateObituaryId(
    memorialId: string,
    obituaryId: string,
  ): Promise<void> {
    await this.prisma.memorial.update({
      where: { id: memorialId },
      data: { obituaryId },
    });

    // Log the update for auditing
    await this.auditService.record({
      subjectType: "Memorial",
      subjectId: memorialId,
      action: "obituary_id_updated",
      payload: { obituaryId },
    });

    this.logger.debug(
      `Updated memorial ${memorialId} with obituary ID ${obituaryId}`,
    );
  }

  /**
   * Find memorial by ID without user access check (for internal use)
   */
  async findOne(memorialId: string): Promise<MemorialResponseDto | null> {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
      include: { location: true },
    });

    if (!memorial) {
      return null;
    }

    return this.mapToResponse(memorial);
  }
}
