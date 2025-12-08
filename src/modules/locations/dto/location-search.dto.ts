import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

class CoordinatesDto {
  @ApiProperty({ description: "Latitude" })
  lat: number;

  @ApiProperty({ description: "Longitude" })
  lng: number;
}

export class LocationSearchResultDto {
  @ApiProperty({ description: "Google Maps place ID" })
  placeId: string;

  @ApiProperty({ description: "Display name" })
  name: string;

  @ApiPropertyOptional({ description: "Formatted address" })
  formattedAddress?: string;

  @ApiPropertyOptional({ description: "Coordinates", type: CoordinatesDto })
  location?: CoordinatesDto;

  @ApiPropertyOptional({ description: "Place types", type: [String] })
  types?: string[];
}

export class LocationSearchQueryDto {
  @ApiProperty({ description: "Search text", example: "San Francisco" })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({
    description: "Maximum number of results",
    minimum: 1,
    maximum: 10,
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
