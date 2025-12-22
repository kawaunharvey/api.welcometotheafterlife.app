import { Injectable } from "@nestjs/common";
import type { LedgerStatusUpdateType } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import type { CurrentUserContext } from "../../auth/current-user.decorator";
import { LedgerService } from "../ledger.service";
import type { CreateNoteDto } from "./dto/create-note.dto";

@Injectable()
export class StatusUpdatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Create a user note as a status update
   */
  async createNote(
    ledgerId: string,
    dto: CreateNoteDto,
    currentUser: CurrentUserContext,
  ) {
    // Verify viewer access (anyone with access can add notes)
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    // If actionId provided, verify it belongs to this ledger
    if (dto.actionId) {
      const action = await this.prisma.ledgerAction.findUniqueOrThrow({
        where: { id: dto.actionId },
      });

      if (action.ledgerId !== ledgerId) {
        throw new Error("Action does not belong to this ledger");
      }
    }

    return this.prisma.ledgerStatusUpdate.create({
      data: {
        ledgerId,
        actionId: dto.actionId,
        type: "USER_NOTE",
        actorUserId: currentUser.userId,
        actorEmail: currentUser.email,
        message: dto.message,
      },
    });
  }

  /**
   * Get all status updates for a ledger with pagination
   */
  async findAll(
    ledgerId: string,
    currentUser: CurrentUserContext,
    options?: {
      limit?: number;
      cursor?: string;
      type?: LedgerStatusUpdateType;
    },
  ) {
    // Verify viewer access
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    const limit = options?.limit || 50;
    const where = {
      ledgerId,
      ...(options?.type && { type: options.type }),
    };

    const updates = await this.prisma.ledgerStatusUpdate.findMany({
      where,
      ...(options?.cursor && {
        cursor: { id: options.cursor },
        skip: 1,
      }),
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return {
      data: updates,
      hasMore: updates.length === limit,
      nextCursor:
        updates.length === limit ? updates[updates.length - 1].id : null,
    };
  }

  /**
   * Get status updates for a specific action
   */
  async findByAction(
    actionId: string,
    currentUser: CurrentUserContext,
    options?: {
      limit?: number;
      cursor?: string;
    },
  ) {
    // Get action and verify access to parent ledger
    const action = await this.prisma.ledgerAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    await this.ledgerService.verifyAccess(
      action.ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    const limit = options?.limit || 50;

    const updates = await this.prisma.ledgerStatusUpdate.findMany({
      where: { actionId },
      ...(options?.cursor && {
        cursor: { id: options.cursor },
        skip: 1,
      }),
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return {
      data: updates,
      hasMore: updates.length === limit,
      nextCursor:
        updates.length === limit ? updates[updates.length - 1].id : null,
    };
  }

  /**
   * Get a single status update
   */
  async findOne(updateId: string, currentUser: CurrentUserContext) {
    const update = await this.prisma.ledgerStatusUpdate.findUniqueOrThrow({
      where: { id: updateId },
    });

    // Verify viewer access to parent ledger
    await this.ledgerService.verifyAccess(
      update.ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    return update;
  }

  /**
   * Get recent updates across all ledgers user has access to
   */
  async findRecent(
    currentUser: CurrentUserContext,
    options?: {
      limit?: number;
      cursor?: string;
    },
  ) {
    const limit = options?.limit || 50;

    // Get all ledgers user has access to
    const ledgers = await this.prisma.ledger.findMany({
      where: {
        OR: [
          { ownerUserId: currentUser.userId },
          {
            collaborators: {
              some: {
                userId: currentUser.userId,
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    const ledgerIds = ledgers.map((l) => l.id);

    if (ledgerIds.length === 0) {
      return {
        data: [],
        hasMore: false,
        nextCursor: null,
      };
    }

    const updates = await this.prisma.ledgerStatusUpdate.findMany({
      where: {
        ledgerId: { in: ledgerIds },
      },
      ...(options?.cursor && {
        cursor: { id: options.cursor },
        skip: 1,
      }),
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return {
      data: updates,
      hasMore: updates.length === limit,
      nextCursor:
        updates.length === limit ? updates[updates.length - 1].id : null,
    };
  }
}
