import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { FeedsService } from "./feeds.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CurrentUser,
  CurrentUserContext,
} from "../auth/current-user.decorator";

@ApiTags("feeds")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("feeds")
export class FeedsController {
  constructor(private feedsService: FeedsService) {}

  @Get("fallback")
  @ApiOperation({ summary: "Get fallback chronological feed" })
  @ApiOkResponse({
    description: "Chronological feed entries with hydrated posts",
  })
  async getFallbackFeed(
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
    @CurrentUser() user?: CurrentUserContext,
  ) {
    const parsedLimit = limit ? Number.parseInt(String(limit), 10) : undefined;
    const entries = await this.feedsService.getFallbackFeedEntries({
      limit: parsedLimit,
      cursor,
      userId: user?.userId,
    });
    return { entries };
  }

  @Get("global")
  @ApiOperation({ summary: "Get global feed of high-engagement videos" })
  @ApiOkResponse({ description: "Global feed entries with hydrated posts" })
  async getGlobalFeed(
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
    @CurrentUser() user?: CurrentUserContext,
  ) {
    const parsedLimit = limit ? Number.parseInt(String(limit), 10) : undefined;
    const entries = await this.feedsService.getGlobalFeedEntries({
      limit: parsedLimit,
      cursor,
      userId: user?.userId,
    });
    return { entries };
  }

  @Get("memorial/:memorialId")
  @ApiOperation({ summary: "Get memorial feed with posts" })
  @ApiParam({ name: "memorialId", description: "Memorial ID" })
  @ApiOkResponse({ description: "Feed entries with hydrated posts" })
  async getMemorialFeed(
    @Param("memorialId") memorialId: string,
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
    @CurrentUser() user?: CurrentUserContext,
  ) {
    const parsedLimit = limit ? Number.parseInt(String(limit), 10) : undefined;
    const entries = await this.feedsService.getMemorialFeedEntries(memorialId, {
      limit: parsedLimit,
      cursor,
      userId: user?.userId,
    });
    return { entries };
  }

  @Post("memorial/:memorialId/rebuild")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rebuild feed entries (admin only)" })
  async rebuildFeed(
    @Param("memorialId") memorialId: string,
    @CurrentUser() user: CurrentUserContext,
  ) {
    // In production, check if user is admin
    // For now, allow rebuilds
    await this.feedsService.rebuildMemorialFeed(memorialId);
    return { message: "Feed rebuilt successfully" };
  }
}
