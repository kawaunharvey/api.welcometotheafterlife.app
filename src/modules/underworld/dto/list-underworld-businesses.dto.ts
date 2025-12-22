import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

// Basic query validation for geo + pagination
export class ListUnderworldBusinessesDto {
  @Transform(({ value }) =>
    value !== undefined ? parseFloat(value) : undefined,
  )
  @IsNumber()
  @Min(-90)
  @Max(90)
  nearLat!: number;

  @Transform(({ value }) =>
    value !== undefined ? parseFloat(value) : undefined,
  )
  @IsNumber()
  @Min(-180)
  @Max(180)
  nearLng!: number;

  @Transform(({ value }) =>
    value !== undefined ? Math.min(Math.max(parseFloat(value), 0.5), 500) : 50,
  )
  @IsNumber()
  @Min(0.5)
  @Max(500)
  radiusKm: number = 50;

  @Transform(({ value }) =>
    value !== undefined ? Math.min(Math.max(parseInt(value, 10), 1), 50) : 20,
  )
  @IsNumber()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return undefined;
  })
  @IsString({ each: true })
  categories?: string[];

  @Transform(({ value }) =>
    value !== undefined ? value === "true" || value === true : true,
  )
  @IsBoolean()
  includeServices: boolean = true;
}

export type UnderworldBusinessesCursor = string | undefined;

export interface UnderworldBusinessesPage<TItem> {
  items: TItem[];
  nextCursor?: UnderworldBusinessesCursor;
  hasMore: boolean;
  count: number;
}
