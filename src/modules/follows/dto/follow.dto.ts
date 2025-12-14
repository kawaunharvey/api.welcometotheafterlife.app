import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { FollowTargetType, MemorialRelationshipKind } from "@prisma/client";

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
  @IsEnum(MemorialRelationshipKind)
  relationship?: MemorialRelationshipKind;

  @ApiPropertyOptional({
    description: "Qualifiers for the relationship (e.g. 'sister', 'coach')",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  qualifier?: string[];
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
  relationship?: MemorialRelationshipKind | null;

  @ApiPropertyOptional({ type: [String] })
  qualifier?: string[];
}
