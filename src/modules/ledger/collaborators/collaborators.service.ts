import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { LedgerCollaboratorRole } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import type { CurrentUserContext } from "../../auth/current-user.decorator";
import { LedgerService } from "../ledger.service";
import type { AddCollaboratorDto } from "./dto/add-collaborator.dto";
import type { UpdateRoleDto } from "./dto/update-role.dto";

@Injectable()
export class CollaboratorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Add a collaborator to a ledger (owner only)
   */
  async add(
    ledgerId: string,
    dto: AddCollaboratorDto,
    currentUser: CurrentUserContext,
  ) {
    // Verify owner access
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "OWNER",
    );

    // Cannot add owner as collaborator
    const ledger = await this.prisma.ledger.findUniqueOrThrow({
      where: { id: ledgerId },
    });

    if (dto.userId === ledger.ownerUserId) {
      throw new BadRequestException("Cannot add the owner as a collaborator");
    }

    // Cannot assign OWNER role through collaborators
    if (dto.role === "OWNER") {
      throw new BadRequestException(
        "Cannot assign OWNER role through collaborators",
      );
    }

    // Check if collaborator already exists
    const existing = await this.prisma.ledgerCollaborator.findUnique({
      where: {
        ledgerId_userId: {
          ledgerId,
          userId: dto.userId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        "User is already a collaborator on this ledger",
      );
    }

    // Add collaborator
    const collaborator = await this.prisma.ledgerCollaborator.create({
      data: {
        ledgerId,
        userId: dto.userId,
        role: dto.role,
        addedByUserId: currentUser.userId,
      },
    });

    // Create status update
    await this.prisma.ledgerStatusUpdate.create({
      data: {
        ledgerId,
        type: "COLLABORATOR_ADDED",
        actorUserId: currentUser.userId,
        actorEmail: currentUser.email,
        message: `Collaborator added with ${dto.role} role`,
        metadata: {
          collaboratorUserId: dto.userId,
          role: dto.role,
        },
      },
    });

    return collaborator;
  }

  /**
   * Get all collaborators for a ledger
   */
  async findAll(ledgerId: string, currentUser: CurrentUserContext) {
    // Verify viewer access
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    return this.prisma.ledgerCollaborator.findMany({
      where: { ledgerId },
      orderBy: { addedAt: "desc" },
    });
  }

  /**
   * Get a single collaborator
   */
  async findOne(collaboratorId: string, currentUser: CurrentUserContext) {
    const collaborator = await this.prisma.ledgerCollaborator.findUniqueOrThrow(
      {
        where: { id: collaboratorId },
      },
    );

    // Verify viewer access to parent ledger
    await this.ledgerService.verifyAccess(
      collaborator.ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    return collaborator;
  }

  /**
   * Update a collaborator's role (owner only)
   */
  async updateRole(
    collaboratorId: string,
    dto: UpdateRoleDto,
    currentUser: CurrentUserContext,
  ) {
    const collaborator = await this.prisma.ledgerCollaborator.findUniqueOrThrow(
      {
        where: { id: collaboratorId },
      },
    );

    // Verify owner access
    await this.ledgerService.verifyAccess(
      collaborator.ledgerId,
      currentUser.userId,
      "OWNER",
    );

    // Cannot assign OWNER role
    if (dto.role === "OWNER") {
      throw new BadRequestException(
        "Cannot assign OWNER role through collaborators",
      );
    }

    const oldRole = collaborator.role;

    // Update role
    const updated = await this.prisma.ledgerCollaborator.update({
      where: { id: collaboratorId },
      data: {
        role: dto.role,
      },
    });

    // Create status update
    await this.prisma.ledgerStatusUpdate.create({
      data: {
        ledgerId: collaborator.ledgerId,
        type: "COLLABORATOR_ROLE_CHANGED",
        actorUserId: currentUser.userId,
        actorEmail: currentUser.email,
        message: `Collaborator role changed from ${oldRole} to ${dto.role}`,
        metadata: {
          collaboratorUserId: collaborator.userId,
          oldRole,
          newRole: dto.role,
        },
      },
    });

    return updated;
  }

  /**
   * Remove a collaborator (owner only, or user removing themselves)
   */
  async remove(collaboratorId: string, currentUser: CurrentUserContext) {
    const collaborator = await this.prisma.ledgerCollaborator.findUniqueOrThrow(
      {
        where: { id: collaboratorId },
      },
    );

    // Either owner or the collaborator themselves can remove
    const isOwner = await this.isOwner(
      collaborator.ledgerId,
      currentUser.userId,
    );
    const isSelf = collaborator.userId === currentUser.userId;

    if (!isOwner && !isSelf) {
      throw new BadRequestException(
        "Only the owner or the collaborator themselves can remove access",
      );
    }

    // Remove collaborator
    await this.prisma.ledgerCollaborator.delete({
      where: { id: collaboratorId },
    });

    // Create status update
    await this.prisma.ledgerStatusUpdate.create({
      data: {
        ledgerId: collaborator.ledgerId,
        type: "COLLABORATOR_REMOVED",
        actorUserId: currentUser.userId,
        actorEmail: currentUser.email,
        message: isSelf
          ? "Collaborator left the ledger"
          : "Collaborator removed",
        metadata: {
          collaboratorUserId: collaborator.userId,
          role: collaborator.role,
          removedBySelf: isSelf,
        },
      },
    });

    return { deleted: true };
  }

  /**
   * Check if a user is the owner of a ledger
   */
  private async isOwner(ledgerId: string, userId: string): Promise<boolean> {
    const ledger = await this.prisma.ledger.findUnique({
      where: { id: ledgerId },
    });

    return ledger?.ownerUserId === userId;
  }
}
