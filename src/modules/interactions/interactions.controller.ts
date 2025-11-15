import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiOperation,
} from "@nestjs/swagger";
import { InteractionsService } from "./interactions.service";
import {
  CreateLikeDto,
  LikeResponseDto,
  CreateCommentDto,
  CommentResponseDto,
} from "./dto/interaction.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CurrentUser,
  CurrentUserContext,
} from "../auth/current-user.decorator";

@ApiTags("interactions")
@Controller("interactions")
export class InteractionsController {
  constructor(private interactionsService: InteractionsService) {}

  @Post("likes")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Toggle like on a post (idempotent)" })
  @ApiCreatedResponse({ type: LikeResponseDto })
  async toggleLike(
    @Body() dto: CreateLikeDto,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<LikeResponseDto> {
    return this.interactionsService.toggleLike(user.userId, dto);
  }

  @Post("comments")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a comment on a post" })
  @ApiCreatedResponse({ type: CommentResponseDto })
  async createComment(
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<CommentResponseDto> {
    return this.interactionsService.createComment(user.userId, dto);
  }

  @Get("comments/:postId")
  @ApiOperation({ summary: "Get comments for a post" })
  @ApiOkResponse({ type: [CommentResponseDto] })
  async getComments(
    @Param("postId") postId: string,
    @Query("limit") limit?: number,
  ): Promise<CommentResponseDto[]> {
    return this.interactionsService.getComments(postId, limit);
  }

  @Delete("comments/:commentId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a comment (author only)" })
  @ApiOkResponse()
  async deleteComment(
    @Param("commentId") commentId: string,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<void> {
    return this.interactionsService.deleteComment(commentId, user.userId);
  }
}
