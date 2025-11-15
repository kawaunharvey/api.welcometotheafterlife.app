import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsEnum } from "class-validator";

export class CreateLikeDto {
  @ApiProperty({ description: "Target type", enum: ["POST"] })
  @IsEnum(["POST"])
  targetType!: "POST";

  @ApiProperty({ description: "Target ID (Post ID)" })
  @IsString()
  targetId!: string;
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
}

export class CommentResponseDto {
  @ApiProperty({ description: "Comment ID" })
  id!: string;

  @ApiProperty({ description: "Author user ID" })
  authorUserId!: string;

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
}
