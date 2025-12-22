import { IsEnum, IsNotEmpty } from "class-validator";
import { LedgerCollaboratorRole } from "@prisma/client";

export class UpdateRoleDto {
  @IsEnum(LedgerCollaboratorRole)
  @IsNotEmpty()
  role: LedgerCollaboratorRole;
}
