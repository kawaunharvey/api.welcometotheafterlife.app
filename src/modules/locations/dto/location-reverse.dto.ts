import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber } from "class-validator";

export class ReverseGeocodeQueryDto {
  @ApiProperty({ description: "Latitude", example: 37.7749 })
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @ApiProperty({ description: "Longitude", example: -122.4194 })
  @Type(() => Number)
  @IsNumber()
  lng: number;
}
