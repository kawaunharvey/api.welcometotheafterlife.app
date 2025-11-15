import { Controller, Get, Patch, Body, UseGuards, Query } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { UsersService } from "./users.service";
import {
  CurrentUser,
  CurrentUserContext,
} from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  UserMeResponseDto,
  UpdateUserDto,
  PaginationQueryDto,
  PaginatedPostsResponseDto,
  PaginatedMemorialsResponseDto,
} from "./dto/user.dto";

@ApiTags("Users")
@Controller("users")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({
    summary: "Get current user profile",
    description:
      "Returns the current authenticated user's profile including total tributes and memorials created. Data is cached for improved performance.",
  })
  @ApiResponse({
    status: 200,
    description: "User profile retrieved successfully",
    type: UserMeResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
  })
  async getCurrentUser(
    @CurrentUser() user: CurrentUserContext,
  ): Promise<UserMeResponseDto> {
    return this.usersService.getUserProfile(user.userId);
  }

  @Get("me/stats")
  @ApiOperation({
    summary: "Get current user statistics",
    description:
      "Returns statistics for the current authenticated user including total tributes and memorials created.",
  })
  @ApiResponse({
    status: 200,
    description: "User statistics retrieved successfully",
    schema: {
      type: "object",
      properties: {
        totalTributes: {
          type: "number",
          description: "Total number of tributes created by the user",
        },
        totalMemorials: {
          type: "number",
          description: "Total number of memorials created by the user",
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
  })
  async getCurrentUserStats(@CurrentUser() user: CurrentUserContext): Promise<{
    totalTributes: number;
    totalMemorials: number;
  }> {
    return this.usersService.getUserStats(user.userId);
  }

  @Patch("me")
  @ApiOperation({
    summary: "Update current user profile",
    description:
      "Updates the current authenticated user's profile information including name, handle, image URL, and date of birth.",
  })
  @ApiResponse({
    status: 200,
    description: "User profile updated successfully",
    type: UserMeResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Bad Request - Invalid input data",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
  })
  @ApiResponse({
    status: 409,
    description: "Conflict - Handle already exists",
  })
  async updateCurrentUser(
    @CurrentUser() user: CurrentUserContext,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserMeResponseDto> {
    return this.usersService.updateUserProfile(user.userId, updateUserDto);
  }

  @Get("me/posts")
  @ApiOperation({
    summary: "Get current user's posts",
    description:
      "Returns a paginated list of posts (tributes) created by the current authenticated user. Includes thumbnails and basic post information.",
  })
  @ApiResponse({
    status: 200,
    description: "User posts retrieved successfully",
    type: PaginatedPostsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
  })
  async getCurrentUserPosts(
    @CurrentUser() user: CurrentUserContext,
    @Query() paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedPostsResponseDto> {
    return this.usersService.getUserPosts(user.userId, paginationQuery);
  }

  @Get("me/memorials")
  @ApiOperation({
    summary: "Get current user's memorials",
    description:
      "Returns a paginated list of memorials created by the current authenticated user. Includes cover images and basic memorial information.",
  })
  @ApiResponse({
    status: 200,
    description: "User memorials retrieved successfully",
    type: PaginatedMemorialsResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing authentication token",
  })
  @ApiResponse({
    status: 404,
    description: "User not found",
  })
  async getCurrentUserMemorials(
    @CurrentUser() user: CurrentUserContext,
    @Query() paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedMemorialsResponseDto> {
    return this.usersService.getUserMemorials(user.userId, paginationQuery);
  }
}
