import {
  Controller,
  Post,
  Get,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from "@nestjs/swagger";
import { PostsService } from "./posts.service";
import {
  CreatePostDto,
  UpdatePostDto,
  PostResponseDto,
  ListPostsQueryDto,
} from "./dto/post.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CurrentUser,
  CurrentUserContext,
} from "../auth/current-user.decorator";

@ApiTags("posts")
@Controller("posts")
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a tribute post" })
  @ApiCreatedResponse({ type: PostResponseDto })
  async createPost(
    @Body() dto: CreatePostDto,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<PostResponseDto> {
    return this.postsService.createTributePost(user.userId, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get post by ID" })
  @ApiOkResponse({ type: PostResponseDto })
  async getPost(
    @Param("id") id: string,
    @CurrentUser() user?: CurrentUserContext,
  ): Promise<PostResponseDto> {
    return this.postsService.getPostById(id, user?.userId);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a post" })
  @ApiOkResponse({ type: PostResponseDto })
  async updatePost(
    @Param("id") id: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<PostResponseDto> {
    return this.postsService.updatePost(id, user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List posts" })
  @ApiQuery({ name: "memorialId", required: false })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "tags", required: false })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: [PostResponseDto] })
  async listPosts(
    @Query() query: ListPostsQueryDto,
  ): Promise<PostResponseDto[]> {
    return this.postsService.listPosts(query);
  }
}
