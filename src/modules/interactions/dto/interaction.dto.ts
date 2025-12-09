import { ApiProperty } from "@nestjs/swagger";
import { LikeTargetType } from "@prisma/client";
import { IsString, IsEnum, IsOptional, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateLikeDto {
  @ApiProperty({ description: "Target type", enum: LikeTargetType })
  @IsEnum(LikeTargetType)
  targetType!: LikeTargetType;

  @ApiProperty({ description: "Target ID (Post ID or Comment ID)" })
  @IsString()
  targetId!: string;
}

export class LikeStatusQueryDto {
  @ApiProperty({ description: "Target type", enum: LikeTargetType })
  @IsEnum(LikeTargetType)
  targetType!: LikeTargetType;

  @ApiProperty({ description: "Target ID (Post ID or Comment ID)" })
  @IsString()
  targetId!: string;
}

export class LikeStatusResponseDto {
  @ApiProperty({ description: "Whether the current user has liked the target" })
  liked!: boolean;

  @ApiProperty({ description: "Total like count for the target" })
  count!: number;
}

export class LikeResponseDto {
  @ApiProperty({ description: "Like ID" })
  id!: string;

  @ApiProperty({ description: "User ID" })
  userId!: string;

  @ApiProperty({ description: "Target type" })
  targetType!: string;

  @ApiProperty({ description: "Target ID" })
  targetId!: string;

  @ApiProperty({ description: "Created timestamp" })
  createdAt!: string;
}

export class CreateCommentDto {
  @ApiProperty({ description: "Target type", enum: ["POST"] })
  @IsEnum(["POST"])
  targetType!: "POST";

  @ApiProperty({ description: "Target ID (Post ID)" })
  @IsString()
  targetId!: string;

  @ApiProperty({ description: "Comment text" })
  @IsString()
  body!: string;

  @ApiProperty({
    description: "Optional parent comment ID when creating a reply",
    required: false,
  })
  @IsOptional()
  @IsString()
  parentCommentId?: string;
}

export class CommentResponseDto {
  @ApiProperty({ description: "Comment ID" })
  id!: string;

  @ApiProperty({ description: "Author user ID" })
  authorUserId!: string;

  @ApiProperty({ description: "Author handle", required: false })
  authorHandle?: string | null;

  @ApiProperty({ description: "Author image URL", required: false })
  authorImageUrl?: string | null;

  @ApiProperty({ description: "Number of direct replies", default: 0 })
  replyCount!: number;

  @ApiProperty({ description: "Target type" })
  targetType!: string;

  @ApiProperty({ description: "Target ID" })
  targetId!: string;

  @ApiProperty({ description: "Comment body" })
  body!: string;

  @ApiProperty({ description: "Comment status" })
  status!: string;

  @ApiProperty({ description: "Created timestamp" })
  createdAt!: string;

  @ApiProperty({ description: "Updated timestamp" })
  updatedAt!: string;

  @ApiProperty({ description: "Parent comment ID (if reply)", required: false })
  parentCommentId?: string;
}

export class ListCommentsQueryDto {
  @ApiProperty({
    description: "Max items to return",
    required: false,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiProperty({
    description: "Cursor (comment ID) for pagination",
    required: false,
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class PaginatedCommentsResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  items!: CommentResponseDto[];

  @ApiProperty({ description: "Cursor for next page", required: false })
  nextCursor?: string;

  @ApiProperty({ description: "Whether more items are available" })
  hasMore!: boolean;
}
