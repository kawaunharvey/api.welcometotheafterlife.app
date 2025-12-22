import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { LedgerAttachmentType } from "@prisma/client";

export class CreateAttachmentDto {
  @IsEnum(LedgerAttachmentType)
  @IsNotEmpty()
  type: LedgerAttachmentType;

  @IsOptional()
  @IsString()
  slotKey?: string; // Optional: will be auto-generated if not provided

  @IsOptional()
  data?: unknown; // Can be null for empty slots
}
