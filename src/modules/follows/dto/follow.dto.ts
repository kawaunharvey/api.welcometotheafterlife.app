import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { FollowTargetType } from "@prisma/client";

export class CreateFollowDto {
  @ApiProperty({
    enum: FollowTargetType,
    description: "Type of target to follow",
  })
  @IsEnum(FollowTargetType)
  targetType: FollowTargetType;

  @ApiProperty({ description: "ID of the target (memorial or user)" })
  @IsString()
  targetId: string;

  @ApiPropertyOptional({
    description: "Relationship to the memorial (MEMORIAL only)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  relationship?: string;
}

export class FollowResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ enum: FollowTargetType })
  targetType: FollowTargetType;

  @ApiProperty()
  targetId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true })
  relationship?: string | null;
}
