import { Injectable } from "@nestjs/common";
import type { LedgerActionStatus } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import type { CurrentUserContext } from "../../auth/current-user.decorator";
import { LedgerService } from "../ledger.service";
import type { CreateActionDto } from "./dto/create-action.dto";
import type { UpdateActionDto } from "./dto/update-action.dto";

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Create a new action in a ledger
   * Requires EDITOR or OWNER role on parent ledger
   */
  async create(
    ledgerId: string,
    dto: CreateActionDto,
    currentUser: CurrentUserContext,
  ) {
    // Verify user has EDITOR access to parent ledger
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "EDITOR",
    );

    const action = await this.prisma.ledgerAction.create({
      data: {
        ledgerId,
        title: dto.title,
        description: dto.description,
        creatorUserId: currentUser.userId,
        creatorEmail: currentUser.email,
      },
    });

    // Create status update for action creation
    await this.prisma.ledgerStatusUpdate.create({
      data: {
        ledgerId,
        actionId: action.id,
        type: "ACTION_CREATED",
        actorUserId: currentUser.userId,
        actorEmail: currentUser.email,
        message: `Action "${action.title}" created`,
      },
    });

    return action;
  }

  /**
   * Get a single action by ID
   * Requires VIEWER access to parent ledger
   */
  async findOne(actionId: string, currentUser: CurrentUserContext) {
    const action = await this.prisma.ledgerAction.findUniqueOrThrow({
      where: { id: actionId },
      include: {
        attachments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // Verify access to parent ledger
    await this.ledgerService.verifyAccess(
      action.ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    return action;
  }

  /**
   * Get all actions for a ledger
   * Requires VIEWER access to parent ledger
   */
  async findAll(ledgerId: string, currentUser: CurrentUserContext) {
    // Verify access to parent ledger
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    return this.prisma.ledgerAction.findMany({
      where: { ledgerId },
      include: {
        _count: {
          select: { attachments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Update an action
   * Requires EDITOR access to parent ledger
   * Automatically creates status updates when status changes
   */
  async update(
    actionId: string,
    dto: UpdateActionDto,
    currentUser: CurrentUserContext,
  ) {
    const action = await this.prisma.ledgerAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    // Verify access to parent ledger
    await this.ledgerService.verifyAccess(
      action.ledgerId,
      currentUser.userId,
      "EDITOR",
    );

    // Check if status is changing
    const statusChanged = dto.status && dto.status !== action.status;
    const oldStatus = action.status;

    // Update the action
    const updatedAction = await this.prisma.ledgerAction.update({
      where: { id: actionId },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
      },
    });

    // Create status update if status changed
    if (statusChanged && dto.status) {
      await this.createStatusChangeUpdate(
        action.ledgerId,
        actionId,
        oldStatus,
        dto.status,
        currentUser,
      );
    }

    return updatedAction;
  }

  /**
   * Delete an action
   * Requires EDITOR access to parent ledger
   */
  async delete(actionId: string, currentUser: CurrentUserContext) {
    const action = await this.prisma.ledgerAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    // Verify access to parent ledger
    await this.ledgerService.verifyAccess(
      action.ledgerId,
      currentUser.userId,
      "EDITOR",
    );

    await this.prisma.ledgerAction.delete({
      where: { id: actionId },
    });

    return { deleted: true };
  }

  /**
   * Create a status update when action status changes
   */
  private async createStatusChangeUpdate(
    ledgerId: string,
    actionId: string,
    oldStatus: LedgerActionStatus,
    newStatus: LedgerActionStatus,
    currentUser: CurrentUserContext,
  ) {
    const statusMessages: Record<LedgerActionStatus, string> = {
      NOT_HANDLED: "not handled",
      IN_PROGRESS: "in progress",
      HANDLED: "handled",
    };

    return this.prisma.ledgerStatusUpdate.create({
      data: {
        ledgerId,
        actionId,
        type: "ACTION_STATUS_CHANGED",
        actorUserId: currentUser.userId,
        actorEmail: currentUser.email,
        message: `Action status changed from ${statusMessages[oldStatus]} to ${statusMessages[newStatus]}`,
        metadata: {
          oldStatus,
          newStatus,
        },
      },
    });
  }
}
