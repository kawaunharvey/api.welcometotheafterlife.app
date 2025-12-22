import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateLedgerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsOptional()
  linkedEntityType?: string; // "memorial" | "fundraiser" | "event" | "underworld_activity"

  @IsString()
  @IsOptional()
  linkedEntityId?: string;
}
