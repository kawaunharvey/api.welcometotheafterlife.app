import { Injectable, Logger } from "@nestjs/common";
import { UnderworldServiceClient, UnderworldBusiness } from "@/common";
import {
  ListUnderworldBusinessesDto,
  UnderworldBusinessesPage,
} from "./dto/list-underworld-businesses.dto";

@Injectable()
export class UnderworldService {
  private readonly logger = new Logger(UnderworldService.name);

  constructor(private readonly client: UnderworldServiceClient) {}

  async listBusinesses(
    params: ListUnderworldBusinessesDto,
  ): Promise<UnderworldBusinessesPage<UnderworldBusiness>> {
    const { limit, cursor } = params;
    const offset = this.decodeCursor(cursor);

    console.log("initialQuery params:", params);

    // Ask underworld for a larger window and slice locally to simulate cursoring.
    const fetchLimit = Math.min(100, offset + limit + 1); // +1 to detect hasMore

    // console.info("underworld listBusinesses proxy", {
    //   nearLat: params.nearLat,
    //   nearLng: params.nearLng,
    //   radiusKm: params.radiusKm,
    //   limit: fetchLimit,
    //   includeServices: params.includeServices,
    //   category: params.category,
    //   categories: params.categories,
    // });

    const response = await this.client.listBusinesses({
      nearLat: params.nearLat,
      nearLng: params.nearLng,
      radiusKm: params.radiusKm,
      limit: fetchLimit,
      includeServices: params.includeServices,
      category: params.category,
      categories: params.categories,
    });

    const items = response.items || [];
    const sliced = items.slice(offset, offset + limit);
    const hasMore = items.length > offset + limit;
    const nextCursor = hasMore ? this.encodeCursor(offset + limit) : undefined;

    // Log once for visibility in case underworld returns fewer than requested
    if (items.length < offset && items.length > 0) {
      this.logger.warn(
        `Underworld returned fewer items than cursor offset; offset=${offset}, returned=${items.length}`,
      );
    }

    return {
      items: sliced,
      nextCursor,
      hasMore,
      count: sliced.length,
    };
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(String(offset), "utf8").toString("base64");
  }

  private decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    try {
      const raw = Buffer.from(cursor, "base64").toString("utf8");
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        return 0;
      }
      return parsed;
    } catch (error) {
      this.logger.warn("Invalid cursor supplied; defaulting to 0", {
        cursor,
        error: (error as Error).message,
      });
      return 0;
    }
  }
}
