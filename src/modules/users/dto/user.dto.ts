import { ApiProperty } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  IsDateString,
  IsUrl,
  Length,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

export class UpdateUserDto {
  @ApiProperty({ required: false, description: "User's display name" })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiProperty({ required: false, description: "User's unique handle" })
  @IsOptional()
  @IsString()
  @Length(3, 30)
  handle?: string;

  @ApiProperty({ required: false, description: "User's profile image URL" })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiProperty({ required: false, description: "User's date of birth" })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}

export class UserMeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty({ required: false })
  handle?: string;

  @ApiProperty({ required: false })
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  imageUrl?: string;

  @ApiProperty()
  status: string;

  @ApiProperty({ type: [String] })
  roles: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({
    description: "Total number of tributes (posts) created by the user",
  })
  totalTributes: number;

  @ApiProperty({ description: "Total number of memorials created by the user" })
  totalMemorials: number;

  @ApiProperty({ required: false })
  creatorProfile?: {
    id: string;
    handle: string;
    type: string;
    bio?: string;
    links: string[];
    verificationLevel?: string;
    status: string;
  };
}

// Pagination DTOs
export class PaginationQueryDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class PostSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false })
  thumbnailUrl?: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  publishedAt: Date;

  @ApiProperty()
  createdAt: Date;
}

export class MemorialSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ required: false })
  coverAssetUrl?: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  createdAt: Date;
}

export class PaginatedPostsResponseDto {
  @ApiProperty({ type: [PostSummaryDto] })
  posts: PostSummaryDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export class PaginatedMemorialsResponseDto {
  @ApiProperty({ type: [MemorialSummaryDto] })
  memorials: MemorialSummaryDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
