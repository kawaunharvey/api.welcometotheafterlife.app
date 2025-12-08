import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  Matches,
  Length,
  MaxLength,
  IsArray,
  IsEnum,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { Visibility } from "@prisma/client";

export class LocationDto {
  @ApiPropertyOptional({ description: "Google Place ID" })
  @IsOptional()
  @IsString()
  googlePlaceId?: string | null;

  @ApiPropertyOptional({ description: "Formatted address" })
  @IsOptional()
  @IsString()
  formattedAddress?: string | null;

  @ApiPropertyOptional({ description: "Latitude" })
  @IsOptional()
  lat?: number | null;

  @ApiPropertyOptional({ description: "Longitude" })
  @IsOptional()
  lng?: number | null;

  @ApiPropertyOptional({ description: "City" })
  @IsOptional()
  @IsString()
  city?: string | null;

  @ApiPropertyOptional({ description: "State" })
  @IsOptional()
  @IsString()
  state?: string | null;

  @ApiPropertyOptional({ description: "Country" })
  @IsOptional()
  @IsString()
  country?: string | null;
}

export class CreateMemorialDto {
  @ApiProperty({
    description:
      "Unique slug for the memorial (3-64 chars, lowercase with hyphens)",
    example: "john-doe-memorial",
  })
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Slug must be lowercase alphanumeric with hyphens only",
  })
  slug: string;

  @ApiProperty({
    description: "Short unique identifier (6 chars, alphanumeric)",
    example: "a1b2c3",
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^[a-zA-Z0-9]{6}$/, {
    message: "Short ID must be 6 alphanumeric characters",
  })
  shortId: string;

  @ApiProperty({
    description: "Display name for the memorial (1-140 chars)",
    example: "John Doe",
  })
  @IsString()
  @Length(1, 140)
  displayName: string;

  @ApiPropertyOptional({
    description: "Salutation",
    example: "Beloved husband",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  salutation?: string;

  @ApiPropertyOptional({ description: "Date of birth" })
  @IsOptional()
  yearOfBirth?: number;

  @ApiPropertyOptional({ description: "Date of passing" })
  @IsOptional()
  yearOfPassing?: number;

  @ApiPropertyOptional({
    description: "Location information",
    type: LocationDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @ApiPropertyOptional({ description: "Bio summary" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bioSummary?: string;

  @ApiPropertyOptional({
    description: "Tags (up to 25 items, max 30 chars each)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({
    description: "Visibility setting",
    enum: Visibility,
    default: Visibility.PUBLIC,
  })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility = Visibility.PUBLIC;

  @ApiPropertyOptional({ description: "Cover asset URL" })
  @IsOptional()
  @IsString()
  coverAssetUrl?: string;

  @ApiPropertyOptional({ description: "Cover asset ID" })
  @IsOptional()
  @IsString()
  coverAssetId?: string;

  @ApiPropertyOptional({ description: "Theme" })
  @IsOptional()
  @IsString()
  theme?: string;
}

export class UpdateMemorialDto {
  @ApiPropertyOptional({ description: "Display name" })
  @IsOptional()
  @IsString()
  @Length(1, 140)
  displayName?: string;

  @ApiPropertyOptional({ description: "Salutation" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  salutation?: string;

  @ApiPropertyOptional({ description: "Date of birth" })
  @IsOptional()
  yearOfBirth?: number;

  @ApiPropertyOptional({ description: "Date of passing" })
  @IsOptional()
  yearOfPassing?: number;

  @ApiPropertyOptional({ description: "Location information" })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @ApiPropertyOptional({ description: "Bio summary" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bioSummary?: string;

  @ApiPropertyOptional({ description: "Tags" })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({ description: "Visibility setting", enum: Visibility })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ description: "Cover asset URL" })
  @IsOptional()
  @IsString()
  coverAssetUrl?: string;

  @ApiPropertyOptional({ description: "Cover asset ID" })
  @IsOptional()
  @IsString()
  coverAssetId?: string;

  @ApiPropertyOptional({ description: "Short unique identifier (6 chars)" })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^[a-zA-Z0-9]{6}$/, {
    message: "Short ID must be 6 alphanumeric characters",
  })
  shortId?: string;

  @ApiPropertyOptional({ description: "Theme" })
  @IsOptional()
  @IsString()
  theme?: string;
}

export class MemorialResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ nullable: true })
  salutation: string | null;

  @ApiProperty({ nullable: true })
  yearOfBirth: number | null;

  @ApiProperty({ nullable: true })
  yearOfPassing: number | null;

  @ApiProperty({ nullable: true, type: LocationDto })
  location: LocationDto | null;

  @ApiProperty({ nullable: true })
  bioSummary: string | null;

  @ApiProperty()
  tags: string[];

  @ApiProperty({ enum: Visibility })
  visibility: Visibility;

  @ApiProperty()
  ownerUserId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ nullable: true })
  archivedAt: Date | null;

  @ApiPropertyOptional({ description: "Latest obituary draft ID" })
  obituaryId?: string | null;

  @ApiPropertyOptional({ description: "Obituary service session ID" })
  obituaryServiceSessionId?: string | null;

  @ApiPropertyOptional({ description: "Cover asset URL" })
  coverAssetUrl?: string | null;

  @ApiPropertyOptional({ description: "Cover asset ID" })
  coverAssetId?: string | null;

  @ApiProperty()
  shortId?: string | null;

  @ApiPropertyOptional({ description: "Theme" })
  theme?: string | null;

  @ApiPropertyOptional({ description: "iOS app URL" })
  iosAppUrl?: string | null;

  @ApiPropertyOptional({ description: "Android app URL" })
  androidAppUrl?: string | null;

  @ApiPropertyOptional({ description: "Share URL" })
  shareUrl?: string | null;

  @ApiPropertyOptional({ description: "Short URL" })
  shortUrl?: string | null;

  @ApiPropertyOptional({ description: "Links" })
  links?: {
    iosAppUrl?: string;
    androidAppUrl?: string;
    webUrl?: string;
    shortUrl?: string;
  };

  @ApiPropertyOptional({ description: "Fundraising information" })
  fundraising?: {
    id: string;
    beneficiaryName?: string | null;
    beneficiaryOnboardingStatus?: string | null;
    beneficiaryExternalId?: string | null;
  };
}
