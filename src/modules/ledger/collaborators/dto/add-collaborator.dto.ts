import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { LedgerCollaboratorRole } from "@prisma/client";

export class AddCollaboratorDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(LedgerCollaboratorRole)
  @IsNotEmpty()
  role: LedgerCollaboratorRole;
}
