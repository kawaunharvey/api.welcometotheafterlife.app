import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsBoolean,
  IsObject,
  MaxLength,
  Length,
} from "class-validator";
import { Type } from "class-transformer";
import { DecoratorStatus, DecoratorType, Visibility } from "@prisma/client";

export enum DecoratorSortField {
  CREATED_AT = "createdAt",
  UPDATED_AT = "updatedAt",
  USAGE_COUNT = "usageCount",
}

export enum SortOrder {
  ASC = "asc",
  DESC = "desc",
}

export class DecoratorResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: DecoratorType })
  type: DecoratorType;

  @ApiProperty()
  label: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty({ type: [String] })
  categories: string[];

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ enum: DecoratorStatus, default: DecoratorStatus.ACTIVE })
  status: DecoratorStatus;

  @ApiProperty({ enum: Visibility, default: Visibility.PUBLIC })
  visibility: Visibility;

  @ApiPropertyOptional()
  textValue?: string | null;

  @ApiPropertyOptional()
  assetUrl?: string | null;

  @ApiPropertyOptional()
  assetType?: string | null;

  @ApiPropertyOptional()
  assetId?: string | null;

  @ApiPropertyOptional()
  thumbnailUrl?: string | null;

  @ApiPropertyOptional({ description: "Arbitrary metadata blob" })
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  collectionId?: string | null;

  @ApiPropertyOptional()
  collectionLabel?: string | null;

  @ApiPropertyOptional()
  collectionSlug?: string | null;

  @ApiPropertyOptional()
  createdByUserId?: string | null;

  @ApiPropertyOptional()
  updatedByUserId?: string | null;

  @ApiProperty({ default: 0 })
  usageCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CreateDecoratorDto {
  @ApiProperty({ enum: DecoratorType })
  @IsEnum(DecoratorType)
  type: DecoratorType;

  @ApiProperty({ description: "Display label", maxLength: 140 })
  @IsString()
  @MaxLength(140)
  label: string;

  @ApiPropertyOptional({ description: "Optional description", maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [String], description: "Structured categories" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ type: [String], description: "Freeform tags" })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    enum: DecoratorStatus,
    default: DecoratorStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(DecoratorStatus)
  status?: DecoratorStatus = DecoratorStatus.ACTIVE;

  @ApiPropertyOptional({ enum: Visibility, default: Visibility.PUBLIC })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility = Visibility.PUBLIC;

  @ApiPropertyOptional({ description: "Text value (for salutations)" })
  @IsOptional()
  @IsString()
  textValue?: string;

  @ApiPropertyOptional({ description: "Asset URL" })
  @IsOptional()
  @IsString()
  assetUrl?: string;

  @ApiPropertyOptional({
    description: "Asset type e.g. image/png, image/svg+xml",
  })
  @IsOptional()
  @IsString()
  assetType?: string;

  @ApiPropertyOptional({ description: "Asset ID from content service" })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({ description: "Thumbnail URL" })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ description: "Arbitrary metadata" })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Collection/pack identifier" })
  @IsOptional()
  @IsString()
  collectionId?: string;
}

export class UpdateDecoratorDto {
  @ApiPropertyOptional({ enum: DecoratorType })
  @IsOptional()
  @IsEnum(DecoratorType)
  type?: DecoratorType;

  @ApiPropertyOptional({ maxLength: 140 })
  @IsOptional()
  @IsString()
  @MaxLength(140)
  label?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: DecoratorStatus })
  @IsOptional()
  @IsEnum(DecoratorStatus)
  status?: DecoratorStatus;

  @ApiPropertyOptional({ enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ description: "Arbitrary metadata" })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Collection/pack identifier" })
  @IsOptional()
  @IsString()
  collectionId?: string;
}

export class DecoratorQueryDto {
  @ApiPropertyOptional({ description: "Full-text query" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: DecoratorType })
  @IsOptional()
  @IsEnum(DecoratorType)
  type?: DecoratorType;

  @ApiPropertyOptional({ enum: DecoratorStatus })
  @IsOptional()
  @IsEnum(DecoratorStatus)
  status?: DecoratorStatus;

  @ApiPropertyOptional({ enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: "Collection/pack identifier" })
  @IsOptional()
  @IsString()
  collectionId?: string;

  @ApiPropertyOptional({
    enum: DecoratorSortField,
    default: DecoratorSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(DecoratorSortField)
  sortBy?: DecoratorSortField = DecoratorSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({ description: "Cursor (decorator id)" })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: "Page size (max 50)", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;

  @ApiPropertyOptional({ description: "Include private/archived when true" })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeHidden?: boolean = false;
}

export class ApplyMemorialDecoratorDto {
  @ApiProperty({ description: "Decorator ID" })
  @IsString()
  decoratorId: string;

  @ApiPropertyOptional({ description: "Display order" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  order?: number;

  @ApiPropertyOptional({ description: "Mark as primary (themes/background)" })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: "Variant/options payload" })
  @IsOptional()
  @IsObject()
  variant?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Effective start" })
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: "Effective end" })
  @IsOptional()
  @IsString()
  effectiveUntil?: string;
}

export class UpdateMemorialDecoratorDto {
  @ApiPropertyOptional({ description: "Display order" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  order?: number;

  @ApiPropertyOptional({ description: "Mark as primary (themes/background)" })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: "Variant/options payload" })
  @IsOptional()
  @IsObject()
  variant?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Effective start" })
  @IsOptional()
  @IsString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: "Effective end" })
  @IsOptional()
  @IsString()
  effectiveUntil?: string;
}

export class PageInfoDto {
  @ApiPropertyOptional({ description: "Cursor for next page" })
  nextCursor?: string | null;

  @ApiProperty({ description: "Indicates if there is another page" })
  hasNext: boolean;
}

export class PaginatedDecoratorsResponseDto {
  @ApiProperty({ type: [DecoratorResponseDto] })
  items: DecoratorResponseDto[];

  @ApiProperty({ type: PageInfoDto })
  pageInfo: PageInfoDto;
}

export class MemorialDecoratorResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  memorialId: string;

  @ApiProperty({ type: DecoratorResponseDto })
  decorator: DecoratorResponseDto;

  @ApiProperty({ default: 0 })
  order: number;

  @ApiProperty({ default: false })
  isPrimary: boolean;

  @ApiPropertyOptional({ description: "Variant/options payload" })
  variant?: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: "Effective start" })
  effectiveFrom?: Date | null;

  @ApiPropertyOptional({ description: "Effective end" })
  effectiveUntil?: Date | null;

  @ApiPropertyOptional()
  appliedByUserId?: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
