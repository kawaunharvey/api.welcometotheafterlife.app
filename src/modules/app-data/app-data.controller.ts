import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AppDataService } from "./app-data.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("app-data")
export class AppDataController {
  constructor(private readonly appDataService: AppDataService) {}

  @UseGuards(JwtAuthGuard)
  @Get("memorials/nearby")
  getNearbyMemorials(
    @Query("lat") lat: number,
    @Query("lng") lng: number,
    @Query("limit") limit?: number,
    @Query("skip") skip?: number,
  ) {
    return this.appDataService.getNearbyMemorials(lat, lng, limit, skip);
  }

  @UseGuards(JwtAuthGuard)
  @Get("memorials/fundraisers/nearby")
  getNearbyFundraiserMemorials(
    @Query("lat") lat: number,
    @Query("lng") lng: number,
    @Query("limit") limit?: number,
    @Query("skip") skip?: number,
  ) {
    return this.appDataService.getNearbyFundraiserMemorials(
      lat,
      lng,
      limit,
      skip,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("posts")
  getCreatorPosts(
    @Query("creatorId") creatorId: string,
    @Query("tags") tags?: string,
    @Query("limit") limit?: number,
  ) {
    // tags can be comma-separated
    const tagList = tags ? tags.split(",") : undefined;
    return this.appDataService.getCreatorPosts(creatorId, tagList, limit);
  }

  @Get("policies")
  getPolicies() {
    return this.appDataService.getPolicies();
  }

  @Get("demo-user")
  getDemoUserData() {
    return this.appDataService.getDemoUserData();
  }
}
