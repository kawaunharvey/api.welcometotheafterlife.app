import type { LedgerAttachmentType } from "@prisma/client";

export interface AttachmentResponseDto {
  id: string;
  actionId: string;
  type: LedgerAttachmentType;
  slotKey: string;
  data: unknown;
  creatorUserId: string;
  creatorEmail: string;
  createdAt: Date;
  updatedAt: Date;
}
