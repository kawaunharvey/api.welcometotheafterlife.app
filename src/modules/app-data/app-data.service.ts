import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PostStatus } from "@prisma/client";
import { RedisService } from "../redis/redis.service";
import { Policy } from "./app-data.types";

@Injectable()
export class AppDataService {
  constructor(
    private prisma: PrismaService,
    private cache: RedisService,
  ) {}

  private logger = new Logger(AppDataService.name);

  /**
   * Get all memorials closest to the user's location, prioritize most recent
   */
  async getNearbyMemorials(lat: number, lng: number, limit = 20, skip = 0) {
    // Haversine formula for distance calculation in MongoDB aggregation
    // Prisma does not support geo queries natively, so we use a workaround
    // We'll sort by proximity (approximate) and recency
    // Note: This assumes location.lat/lng are present
    const memorials = await this.prisma.memorial.findMany({
      where: {
        location: {
          isNot: null,
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: limit * 3, // fetch more to filter by distance in JS
    });
    // Calculate distance in JS (since Prisma/MongoDB doesn't support geo queries directly)
    const withDistance = memorials
      .map((m) => {
        const mLat = m.location?.lat;
        const mLng = m.location?.lng;
        if (typeof mLat !== "number" || typeof mLng !== "number") return null;
        const d = this.haversine(lat, lng, mLat, mLng);
        return { ...m, distance: d };
      })
      .filter(
        (m): m is (typeof memorials)[number] & { distance: number } => !!m,
      )
      .sort((a, b) => {
        if (!a || !b) return 0;
        return (
          a.distance - b.distance ||
          b.createdAt.getTime() - a.createdAt.getTime()
        );
      });
    const items = withDistance.slice(skip, skip + limit);
    // if there are not enough nearby memorials, fill in with most recent
    if (items.length < limit) {
      return await this.prisma.memorial.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: limit, // fetch more to filter by distance in JS
      });
    }
    return items;
  }

  /**
   * Get all memorials with fundraisers >50% of goal, closest to user
   */
  async getNearbyFundraiserMemorials(
    lat: number,
    lng: number,
    limit = 20,
    skip = 0,
  ) {
    // Find fundraising programs >50% of goal
    const fundraisers = await this.prisma.fundraisingProgram.findMany({
      where: {
        goalAmountCents: { not: null },
        currentAmountCents: { gt: 0 },
        status: "ACTIVE",
      },
      include: {
        memorial: true,
      },
    });
    // Filter by >50% of goal
    const filtered = fundraisers.filter((f) => {
      if (!f.goalAmountCents) return false;
      const m = f.memorial;
      const mLat = m?.location?.lat;
      const mLng = m?.location?.lng;
      return (
        f.currentAmountCents / f.goalAmountCents > 0.5 &&
        typeof mLat === "number" &&
        typeof mLng === "number"
      );
    });
    // Calculate distance
    const withDistance = filtered
      .map((f) => {
        const m = f.memorial;
        const mLat = m?.location?.lat as number;
        const mLng = m?.location?.lng as number;
        const d = this.haversine(lat, lng, mLat, mLng);
        return { ...f, distance: d };
      })
      .sort((a, b) => a.distance - b.distance);
    return withDistance.slice(skip, skip + limit);
  }

  /**
   * Get posts by creator, filterable by tags
   */
  async getCreatorPosts(creatorId: string, tags?: string[], limit = 20) {
    const where = {
      creatorId,
      status: PostStatus.PUBLISHED,
      ...(tags && tags.length > 0 ? { tags: { hasSome: tags } } : {}),
    };
    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
    return posts;
  }

  getDemoUserData() {
    this.logger.log("Fetching demo user data");
    return {
      demoUser: {
        email: process.env.DEMO_USER_EMAIL,
        disabled: false,
        code: process.env.DEMO_USER_CODE,
        message:
          "All data associated with this demo user will be periodically deleted to reset the demo environment.",
      },
    };
  }

  async getPolicies() {
    // get from cache first
    const cacheKey = "app:policies";
    const cached = await this.cache.get<Policy[]>(cacheKey);
    if (cached) {
      this.logger.log("Returning cached policies");
      return {
        policies: cached,
      };
    }
    // # Legal
    // APP_TERMS_OF_SERVICE_URL="https://welcometotheafterlife.app/terms"
    // APP_PRIVACY_POLICY_URL="https://welcometotheafterlife.app/privacy"
    // APP_COMMUNITY_GUIDELINES_URL="https://welcometotheafterlife.app/guidelines"
    // APP_SUPPORT_URL="https://welcometotheafterlife.app/support"
    // APP_YOUR_DATA_URL="https://welcometotheafterlife.app/your-data"
    // APP_ABOUT_US_URL="https://welcometotheafterlife.app/about-us"

    this.logger.log("Fetching policies");
    const policyList = [
      {
        id: "aboutUs",
        url: process.env.APP_ABOUT_US_URL,
        label: "About Us",
      },
      {
        id: "termsOfService",
        url: process.env.APP_TERMS_OF_SERVICE_URL,
        label: "Terms of Service",
      },
      {
        id: "privacyPolicy",
        url: process.env.APP_PRIVACY_POLICY_URL,
        label: "Privacy Policy",
      },
      {
        id: "yourData",
        url: process.env.APP_YOUR_DATA_URL,
        label: "Your Data",
      },
      {
        id: "communityGuidelines",
        url: process.env.APP_COMMUNITY_GUIDELINES_URL,
        label: "Community Guidelines",
      },
      {
        id: "support",
        url: process.env.APP_SUPPORT_URL,
        label: "Help & Support",
      },
    ].filter((p) => Boolean(p.url));
    // cache policies in Redis for 1 hour
    await this.cache.set(cacheKey, JSON.stringify(policyList), 3600);
    return {
      policies: policyList,
    };
  }

  /**
   * Haversine formula for distance between two lat/lng points (km)
   */
  private haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
