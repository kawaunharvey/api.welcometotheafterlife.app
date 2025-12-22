export interface LedgerResponseDto {
  id: string;
  ownerUserId: string;
  title: string;
  description?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  createdAt: Date;
  updatedAt: Date;

  // Optional nested data
  actions?: ActionSummaryDto[];
  collaborators?: CollaboratorDto[];
  statusUpdates?: StatusUpdateDto[];
}

export interface ActionSummaryDto {
  id: string;
  title: string;
  description?: string;
  status: string;
  creatorUserId: string;
  creatorEmail: string;
  createdAt: Date;
  updatedAt: Date;
  attachmentCount?: number;
}

export interface CollaboratorDto {
  id: string;
  userId: string;
  role: string;
  addedByUserId: string;
  addedAt: Date;
}

export interface StatusUpdateDto {
  id: string;
  type: string;
  actorUserId?: string;
  actorEmail?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
