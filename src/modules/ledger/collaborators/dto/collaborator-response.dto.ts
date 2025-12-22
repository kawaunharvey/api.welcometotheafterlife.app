import type { LedgerCollaboratorRole } from "@prisma/client";

export interface CollaboratorResponseDto {
  id: string;
  ledgerId: string;
  userId: string;
  role: LedgerCollaboratorRole;
  addedByUserId: string;
  addedAt: Date;
  updatedAt: Date;
}
