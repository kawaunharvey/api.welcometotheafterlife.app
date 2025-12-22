import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import type { CurrentUserContext } from "../../auth/current-user.decorator";
import { LedgerService } from "../ledger.service";
import type { CreateAttachmentDto } from "./dto/create-attachment.dto";
import type { FillAttachmentDto } from "./dto/fill-attachment.dto";
import { AttachmentValidator } from "./validators/attachment-validator";

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Create a new attachment for an action
   * Can create empty slots (data: null) or filled slots
   * Validates payload based on type
   */
  async create(
    actionId: string,
    dto: CreateAttachmentDto,
    currentUser: CurrentUserContext,
  ) {
    // Get action and verify access to parent ledger
    const action = await this.prisma.ledgerAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    await this.ledgerService.verifyAccess(
      action.ledgerId,
      currentUser.userId,
      "EDITOR",
    );

    // Validate data if provided
    if (dto.data !== null && dto.data !== undefined) {
      AttachmentValidator.validate(dto.type, dto.data);
    }

    // Generate slot key if not provided
    const slotKey =
      dto.slotKey || AttachmentValidator.generateSlotKey(dto.type);

    // Create attachment
    const attachment = await this.prisma.ledgerAttachment.create({
      data: {
        actionId,
        type: dto.type,
        slotKey,
        data: dto.data ?? null,
        creatorUserId: currentUser.userId,
        creatorEmail: currentUser.email,
      },
    });

    // Create status update if data was filled
    if (dto.data !== null && dto.data !== undefined) {
      await this.prisma.ledgerStatusUpdate.create({
        data: {
          ledgerId: action.ledgerId,
          actionId: action.id,
          type: "ATTACHMENT_FILLED",
          actorUserId: currentUser.userId,
          actorEmail: currentUser.email,
          message: `Attachment slot "${slotKey}" filled`,
          metadata: {
            attachmentType: dto.type,
            slotKey,
          },
        },
      });
    }

    return attachment;
  }

  /**
   * Get all attachments for an action
   */
  async findAll(actionId: string, currentUser: CurrentUserContext) {
    const action = await this.prisma.ledgerAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    await this.ledgerService.verifyAccess(
      action.ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    return this.prisma.ledgerAttachment.findMany({
      where: { actionId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Get a single attachment by ID
   */
  async findOne(attachmentId: string, currentUser: CurrentUserContext) {
    const attachment = await this.prisma.ledgerAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
      include: {
        action: true,
      },
    });

    await this.ledgerService.verifyAccess(
      attachment.action.ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    return attachment;
  }

  /**
   * Fill an empty attachment slot or update existing data
   */
  async fill(
    attachmentId: string,
    dto: FillAttachmentDto,
    currentUser: CurrentUserContext,
  ) {
    const attachment = await this.prisma.ledgerAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
      include: {
        action: true,
      },
    });

    await this.ledgerService.verifyAccess(
      attachment.action.ledgerId,
      currentUser.userId,
      "EDITOR",
    );

    // Validate new data
    AttachmentValidator.validate(attachment.type, dto.data);

    // Check if slot was previously empty
    const wasEmpty = attachment.data === null;

    // Update attachment
    const updated = await this.prisma.ledgerAttachment.update({
      where: { id: attachmentId },
      data: {
        data: dto.data as Prisma.InputJsonValue,
      },
    });

    // Create status update
    await this.prisma.ledgerStatusUpdate.create({
      data: {
        ledgerId: attachment.action.ledgerId,
        actionId: attachment.actionId,
        type: "ATTACHMENT_FILLED",
        actorUserId: currentUser.userId,
        actorEmail: currentUser.email,
        message: wasEmpty
          ? `Attachment slot "${attachment.slotKey}" filled`
          : `Attachment slot "${attachment.slotKey}" updated`,
        metadata: {
          attachmentType: attachment.type,
          slotKey: attachment.slotKey,
          wasEmpty,
        },
      },
    });

    return updated;
  }

  /**
   * Delete an attachment
   */
  async delete(attachmentId: string, currentUser: CurrentUserContext) {
    const attachment = await this.prisma.ledgerAttachment.findUniqueOrThrow({
      where: { id: attachmentId },
      include: {
        action: true,
      },
    });

    await this.ledgerService.verifyAccess(
      attachment.action.ledgerId,
      currentUser.userId,
      "EDITOR",
    );

    await this.prisma.ledgerAttachment.delete({
      where: { id: attachmentId },
    });

    return { deleted: true };
  }

  /**
   * Get attachment by slot key
   * Useful for checking if a single-slot attachment already exists
   */
  async findBySlotKey(
    actionId: string,
    slotKey: string,
    currentUser: CurrentUserContext,
  ) {
    const action = await this.prisma.ledgerAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    await this.ledgerService.verifyAccess(
      action.ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    const attachment = await this.prisma.ledgerAttachment.findUnique({
      where: {
        actionId_slotKey: {
          actionId,
          slotKey,
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException(
        `Attachment with slot key "${slotKey}" not found`,
      );
    }

    return attachment;
  }

  /**
   * Get all empty slots for an action (where data is null)
   */
  async findEmptySlots(actionId: string, currentUser: CurrentUserContext) {
    const action = await this.prisma.ledgerAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    await this.ledgerService.verifyAccess(
      action.ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    return this.prisma.ledgerAttachment.findMany({
      where: {
        actionId,
        data: undefined,
      },
      orderBy: { createdAt: "asc" },
    });
  }
}
