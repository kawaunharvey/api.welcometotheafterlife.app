import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
  MaxLength,
  Min,
  IsNumber,
  IsUrl,
} from "class-validator";
import { Type } from "class-transformer";
import { Visibility, PostStatus } from "@prisma/client";

export class BaseMediaDto {
  @ApiProperty({
    description: "Media type",
    enum: ["image", "video"],
  })
  @IsEnum(["image", "video"])
  type!: "image" | "video";

  @ApiPropertyOptional({ description: "Content Service asset ID" })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({ description: "Direct URL to media" })
  @IsOptional()
  @IsUrl()
  url?: string;

  @ApiPropertyOptional({ description: "Aspect ratio (width/height)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aspectRatio?: number;

  @ApiPropertyOptional({ description: "Scale factor" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  scale?: number;

  @ApiPropertyOptional({ description: "X position" })
  @IsOptional()
  @IsNumber()
  x?: number;

  @ApiPropertyOptional({ description: "Y position" })
  @IsOptional()
  @IsNumber()
  y?: number;
}

export class OverlayDto {
  @ApiPropertyOptional({ description: "Overlay unique ID" })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: "Overlay type",
    enum: ["text", "sticker"],
  })
  @IsEnum(["text", "sticker"])
  type!: "text" | "sticker";

  @ApiPropertyOptional({ description: "Content Service asset ID for sticker" })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({ description: "Text content for text overlays" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  text?: string;

  @ApiProperty({ description: "X position" })
  @IsNumber()
  x!: number;

  @ApiProperty({ description: "Y position" })
  @IsNumber()
  y!: number;

  @ApiPropertyOptional({ description: "Scale factor" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  scale?: number;

  @ApiPropertyOptional({ description: "Rotation in degrees" })
  @IsOptional()
  @IsNumber()
  rotation?: number;

  @ApiPropertyOptional({ description: "Color (hex or CSS color)" })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: "Z-index for layering" })
  @IsOptional()
  @IsNumber()
  zIndex?: number;
}

export class FilterDto {
  @ApiProperty({ description: "Filter ID/name" })
  @IsString()
  id!: string;

  @ApiProperty({ description: "Filter intensity (0-1)" })
  @IsNumber()
  @Min(0)
  intensity!: number;
}

export class CompositionDto {
  @ApiPropertyOptional({ description: "Base media layer" })
  @IsOptional()
  @ValidateNested()
  @Type(() => BaseMediaDto)
  baseMedia?: BaseMediaDto;

  @ApiPropertyOptional({
    description: "Overlay elements (text, stickers)",
    type: [OverlayDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OverlayDto)
  overlays?: OverlayDto[];

  @ApiPropertyOptional({ description: "Applied filter" })
  @IsOptional()
  @ValidateNested()
  @Type(() => FilterDto)
  filter?: FilterDto;

  @ApiPropertyOptional({ description: "Composition version" })
  @IsOptional()
  @IsNumber()
  version?: number;
}

export class CreatePostDto {
  @ApiProperty({ description: "Post type", enum: ["TRIBUTE"] })
  @IsEnum(["TRIBUTE"])
  type!: "TRIBUTE";

  @ApiPropertyOptional({ description: "Memorial ID" })
  @IsOptional()
  @IsString()
  memorialId?: string;

  @ApiPropertyOptional({ description: "Post title" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: "Caption/summary" })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  caption?: string;

  @ApiPropertyOptional({
    description: "Post composition (media, overlays, filters)",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompositionDto)
  composition?: CompositionDto;

  @ApiPropertyOptional({
    description: "Array of Content Service asset IDs used in this post",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetRefs?: string[];

  @ApiPropertyOptional({
    description: "Tags for categorization",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: "Categories",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({
    description: "Visibility level",
    enum: Object.values(Visibility),
  })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({
    description: "Publication status",
    enum: ["DRAFT", "PUBLISHED"],
  })
  @IsOptional()
  @IsEnum(["DRAFT", "PUBLISHED"])
  status?: PostStatus;
}

export class UpdatePostDto {
  @ApiPropertyOptional({ description: "Updated title" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: "Updated caption" })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  caption?: string;

  @ApiPropertyOptional({
    description: "Updated composition (media, overlays, filters)",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompositionDto)
  composition?: CompositionDto;

  @ApiPropertyOptional({
    description: "Updated asset references",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetRefs?: string[];

  @ApiPropertyOptional({
    description: "Updated tags",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: "Updated categories",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({
    description: "Updated visibility",
    enum: Object.values(Visibility),
  })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({
    description: "Updated status",
    enum: ["DRAFT", "PUBLISHED"],
  })
  @IsOptional()
  @IsEnum(["DRAFT", "PUBLISHED"])
  status?: PostStatus;
}

export class PostMetricsDto {
  @ApiProperty({ description: "Impression count" })
  impressions!: number;

  @ApiProperty({ description: "Click count" })
  clicks!: number;

  @ApiProperty({ description: "Watch time in milliseconds" })
  watchTimeMs!: number;

  @ApiProperty({ description: "Like count" })
  likes!: number;

  @ApiProperty({ description: "Flag/report count" })
  flags!: number;
}

export class PostResponseDto {
  @ApiProperty({ description: "Post ID" })
  id!: string;

  @ApiProperty({ description: "Post type" })
  type!: string;

  @ApiProperty({ description: "Author user ID" })
  authorUserId!: string;

  @ApiProperty({ description: "Memorial ID" })
  memorialId?: string;

  @ApiPropertyOptional({ description: "Post title" })
  title?: string;

  @ApiPropertyOptional({ description: "Caption" })
  caption?: string;

  @ApiPropertyOptional({
    description: "Post composition (media, overlays, filters)",
  })
  composition?: CompositionDto;

  @ApiPropertyOptional({
    description: "Asset references",
    type: [String],
  })
  assetRefs?: string[];

  @ApiPropertyOptional({
    description: "Tags",
    type: [String],
  })
  tags?: string[];

  @ApiPropertyOptional({
    description: "Categories",
    type: [String],
  })
  categories?: string[];

  @ApiProperty({ description: "Visibility" })
  visibility!: string;

  @ApiProperty({ description: "Status" })
  status!: string;

  @ApiPropertyOptional({ description: "Publication timestamp" })
  publishedAt?: string;

  @ApiPropertyOptional({ description: "Metrics" })
  metrics?: PostMetricsDto;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt!: string;

  @ApiProperty({ description: "Update timestamp" })
  updatedAt!: string;
}

export class ListPostsQueryDto {
  @ApiPropertyOptional({ description: "Filter by memorial ID" })
  @IsOptional()
  @IsString()
  memorialId?: string;

  @ApiPropertyOptional({ description: "Search query for caption/body" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "Comma-separated tags to filter by",
  })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: "Results per page", example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: "Pagination cursor" })
  @IsOptional()
  @IsString()
  cursor?: string;
}
