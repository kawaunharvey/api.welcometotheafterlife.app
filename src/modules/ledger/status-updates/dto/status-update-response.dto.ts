import type { LedgerStatusUpdateType } from "@prisma/client";

export interface StatusUpdateResponseDto {
  id: string;
  ledgerId: string;
  actionId?: string;
  type: LedgerStatusUpdateType;
  actorUserId?: string;
  actorEmail?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
