import {
  Controller,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  Get,
  Param,
} from "@nestjs/common";
import {
  ApiTags,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiOperation,
} from "@nestjs/swagger";
import { FollowsService } from "./follows.service";
import { CreateFollowDto, FollowResponseDto } from "./dto/follow.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CurrentUser,
  CurrentUserContext,
} from "../auth/current-user.decorator";
import { FollowTargetType } from "@prisma/client";

@ApiTags("follows")
@Controller("follows")
export class FollowsController {
  private readonly logger = new (require("@nestjs/common").Logger)(
    FollowsController.name,
  );
  constructor(private followsService: FollowsService) {}

  /**
   * Follow a memorial or creator.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Follow a memorial or creator" })
  @ApiCreatedResponse({ type: FollowResponseDto })
  async follow(
    @Body() dto: CreateFollowDto,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<FollowResponseDto> {
    return this.followsService.follow(user.userId, dto);
  }

  /**
   * Unfollow a memorial or creator.
   */
  @Delete()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: "Unfollow a memorial or creator" })
  async unfollow(
    @Query("targetType") targetType: string,
    @Query("targetId") targetId: string,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<void> {
    return this.followsService.unfollow(
      user.userId,
      targetType as unknown as FollowTargetType,
      targetId,
    );
  }

  /**
   * Check if the current user is following a memorial.
   */
  @Get(":memorialId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Check if following a memorial" })
  async isFollowingMemorial(
    @Param("memorialId") memorialId: string,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<{ isFollowing: boolean }> {
    const isFollowing = await this.followsService.isFollowing(
      user.userId,
      FollowTargetType.MEMORIAL,
      memorialId,
    );
    return { isFollowing };
  }
}
