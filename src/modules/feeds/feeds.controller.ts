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

  @Get("memorial/:memorialId")
  @ApiOperation({ summary: "Get memorial feed with posts" })
  @ApiParam({ name: "memorialId", description: "Memorial ID" })
  @ApiOkResponse({ description: "Feed entries with hydrated posts" })
  async getMemorialFeed(
    @Param("memorialId") memorialId: string,
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
  ) {
    const entries = await this.feedsService.getMemorialFeedEntries(memorialId, {
      limit: limit ? Number.parseInt(String(limit), 10) : 20,
      cursor,
    });
    return { entries };
  }

  @Post(":feedId/rebuild")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rebuild feed entries (admin only)" })
  async rebuildFeed(
    @Param("feedId") feedId: string,
    @CurrentUser() user: CurrentUserContext,
  ) {
    // In production, check if user is admin
    // For now, allow rebuilds
    const feed = await this.feedsService.getFeedById(feedId);
    if (feed?.memorialId) {
      await this.feedsService.rebuildMemorialFeed(feed.memorialId);
      return { message: "Feed rebuilt successfully" };
    }
    return { message: "Feed not found" };
  }
}
