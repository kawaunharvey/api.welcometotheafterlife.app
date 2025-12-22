import { IsNotEmpty, IsOptional } from "class-validator";

export class FillAttachmentDto {
  @IsNotEmpty()
  @IsOptional()
  data?: unknown; // Payload to fill the slot
}
