import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CacheService } from "../../common/cache/cache.service";
import {
  UserMeResponseDto,
  UpdateUserDto,
  PaginatedPostsResponseDto,
  PaginatedMemorialsResponseDto,
  PaginationQueryDto,
} from "./dto/user.dto";
import moment from "moment";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getUserProfile(userId: string): Promise<UserMeResponseDto> {
    const cacheKey = CacheService.generateKey("user_profile", userId);

    try {
      // Try to get from cache first
      const cachedProfile =
        await this.cacheService.get<UserMeResponseDto>(cacheKey);
      if (cachedProfile) {
        this.logger.debug(`Returning cached profile for user ${userId}`);
        return cachedProfile;
      }

      // If not in cache, fetch from database
      const userProfile = await this.fetchUserProfileFromDatabase(userId);

      // Cache the result
      await this.cacheService.set(cacheKey, userProfile, {
        ttl: this.CACHE_TTL,
        tags: [`user:${userId}`, "user_profiles"],
      });

      this.logger.debug(`Cached profile for user ${userId}`);
      return userProfile;
    } catch (error) {
      this.logger.error(`Error getting user profile for ${userId}:`, error);
      throw error;
    }
  }

  private async fetchUserProfileFromDatabase(
    userId: string,
  ): Promise<UserMeResponseDto> {
    // Fetch user with creator profile
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Count tributes (posts) created by the user
    // We need to count both direct posts by userId and posts through creator profile
    const tributeCount = await this.prisma.post.count({
      where: {
        OR: [{ authorUserId: userId }],
        status: { not: "REMOVED" }, // Exclude removed posts
      },
    });

    // Count memorials created by the user
    const memorialCount = await this.prisma.memorial.count({
      where: {
        ownerUserId: userId,
        status: { not: "ARCHIVED" }, // Exclude archived memorials
      },
    });

    // Construct response
    const response: UserMeResponseDto = {
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      handle: user.handle || undefined,
      dateOfBirth: user.dateOfBirth
        ? moment(user.dateOfBirth).toISOString()
        : undefined,
      imageUrl: user.imageUrl || undefined,
      status: user.status,
      roles: user.roles,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      totalTributes: tributeCount,
      totalMemorials: memorialCount,
    };

    return response;
  }

  async invalidateUserCache(userId: string): Promise<void> {
    try {
      await this.cacheService.invalidateByTags([`user:${userId}`]);
      this.logger.debug(`Invalidated cache for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error invalidating cache for user ${userId}:`, error);
    }
  }

  async invalidateAllUserCaches(): Promise<void> {
    try {
      await this.cacheService.invalidateByTags(["user_profiles"]);
      this.logger.debug("Invalidated all user profile caches");
    } catch (error) {
      this.logger.error("Error invalidating all user caches:", error);
    }
  }

  async getUserStats(
    userId: string,
  ): Promise<{ totalTributes: number; totalMemorials: number }> {
    const cacheKey = CacheService.generateKey("user_stats", userId);

    try {
      // Try to get from cache first
      const cachedStats = await this.cacheService.get<{
        totalTributes: number;
        totalMemorials: number;
      }>(cacheKey);
      if (cachedStats) {
        this.logger.debug(`Returning cached stats for user ${userId}`);
        return cachedStats;
      }

      // Fetch user to get creator profile ID
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Count tributes and memorials
      const [tributeCount, memorialCount] = await Promise.all([
        this.prisma.post.count({
          where: {
            OR: [{ authorUserId: userId }],
            status: { not: "REMOVED" },
          },
        }),
        this.prisma.memorial.count({
          where: {
            ownerUserId: userId,
            status: { not: "ARCHIVED" },
          },
        }),
      ]);

      const stats = {
        totalTributes: tributeCount,
        totalMemorials: memorialCount,
      };

      // Cache the stats for a shorter time since they can change more frequently
      await this.cacheService.set(cacheKey, stats, {
        ttl: 60, // 1 minute
        tags: [`user:${userId}`, "user_stats"],
      });

      return stats;
    } catch (error) {
      this.logger.error(`Error getting user stats for ${userId}:`, error);
      throw error;
    }
  }

  async updateUserProfile(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserMeResponseDto> {
    try {
      // Check if handle is being updated and if it already exists
      if (updateUserDto.handle) {
        const existingUser = await this.prisma.user.findUnique({
          where: { handle: updateUserDto.handle },
        });

        if (existingUser && existingUser.id !== userId) {
          throw new ConflictException(
            `Handle '${updateUserDto.handle}' is already taken`,
          );
        }
      }

      // Convert dateOfBirth string to Date if provided and prepare update data
      const updateData: {
        name?: string;
        handle?: string;
        imageUrl?: string;
        dateOfBirth?: Date;
      } = {};

      if (updateUserDto.name !== undefined) {
        updateData.name = updateUserDto.name;
      }
      if (updateUserDto.handle !== undefined) {
        updateData.handle = updateUserDto.handle;
      }
      if (updateUserDto.imageUrl !== undefined) {
        updateData.imageUrl = updateUserDto.imageUrl;
      }
      if (updateUserDto.dateOfBirth !== undefined) {
        updateData.dateOfBirth = new Date(updateUserDto.dateOfBirth);
      }

      // Update the user
      await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      // Invalidate user cache since data changed
      await this.invalidateUserCache(userId);

      // Return updated profile
      return this.getUserProfile(userId);
    } catch (error) {
      this.logger.error(`Error updating user profile for ${userId}:`, error);
      throw error;
    }
  }

  async getUserPosts(
    userId: string,
    paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedPostsResponseDto> {
    const { page = 1, limit = 10 } = paginationQuery;
    const skip = (page - 1) * limit;

    try {
      // Fetch user to get creator profile ID if needed
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Build where clause for posts
      const whereClause = {
        OR: [{ authorUserId: userId }],
        status: { not: "REMOVED" as const },
        publishedAt: { not: null }, // Only published posts
      };

      // Get total count and posts in parallel
      const [total, posts] = await Promise.all([
        this.prisma.post.count({ where: whereClause }),
        this.prisma.post.findMany({
          where: whereClause,
          select: {
            id: true,
            publishedAt: true,
            createdAt: true,
            baseMedia: true,
            thumbnail: true,
            caption: true,
          },
          orderBy: { publishedAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      const pages = Math.ceil(total / limit);

      return {
        posts: posts.map((post) => ({
          id: post.id,
          baseMediaUrl: post.baseMedia?.url,
          caption: post.caption,
          thumbnailUrl: post.thumbnail?.url,
          publishedAt: post.publishedAt!,
          createdAt: post.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting user posts for ${userId}:`, error);
      throw error;
    }
  }

  async getUserMemorials(
    userId: string,
    paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedMemorialsResponseDto> {
    const { page = 1, limit = 10 } = paginationQuery;
    const skip = (page - 1) * limit;

    try {
      const whereClause = {
        ownerUserId: userId,
        status: { not: "ARCHIVED" as const },
      };

      // Get total count and memorials in parallel
      const [total, memorials] = await Promise.all([
        this.prisma.memorial.count({ where: whereClause }),
        this.prisma.memorial.findMany({
          where: whereClause,
          select: {
            id: true,
            displayName: true,
            coverAssetUrl: true,
            slug: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
      ]);

      const pages = Math.ceil(total / limit);

      return {
        memorials: memorials.map((memorial) => ({
          id: memorial.id,
          displayName: memorial.displayName,
          coverAssetUrl: memorial.coverAssetUrl || undefined,
          slug: memorial.slug,
          createdAt: memorial.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting user memorials for ${userId}:`, error);
      throw error;
    }
  }
}
