import type { LedgerActionStatus } from "@prisma/client";

export interface ActionResponseDto {
  id: string;
  ledgerId: string;
  title: string;
  description?: string;
  status: LedgerActionStatus;
  creatorUserId: string;
  creatorEmail: string;
  createdAt: Date;
  updatedAt: Date;

  // Optional nested data
  attachments?: AttachmentSummaryDto[];
}

export interface AttachmentSummaryDto {
  id: string;
  type: string;
  slotKey: string;
  data: unknown;
  createdAt: Date;
}
