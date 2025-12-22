import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { LedgerCollaboratorRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { CurrentUserContext } from "../auth/current-user.decorator";
import type { CreateLedgerDto } from "./dto/create-ledger.dto";
import type { UpdateLedgerDto } from "./dto/update-ledger.dto";

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new ledger owned by the current user
   */
  async create(dto: CreateLedgerDto, currentUser: CurrentUserContext) {
    const ledger = await this.prisma.ledger.create({
      data: {
        ownerUserId: currentUser.userId,
        title: dto.title,
        description: dto.description,
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId,
      },
    });

    // Create initial status update
    await this.prisma.ledgerStatusUpdate.create({
      data: {
        ledgerId: ledger.id,
        type: "LEDGER_CREATED",
        actorUserId: currentUser.userId,
        actorEmail: currentUser.email,
        message: `Ledger "${ledger.title}" created`,
      },
    });

    return ledger;
  }

  /**
   * Get a single ledger with optional nested data
   */
  async findOne(
    ledgerId: string,
    currentUser: CurrentUserContext,
    includeNested = false,
  ) {
    await this.verifyAccess(ledgerId, currentUser.userId, "VIEWER");

    return this.prisma.ledger.findUnique({
      where: { id: ledgerId },
      include: includeNested
        ? {
            actions: {
              include: {
                _count: {
                  select: { attachments: true },
                },
              },
              orderBy: { createdAt: "desc" },
            },
            collaborators: {
              orderBy: { addedAt: "desc" },
            },
            statusUpdates: {
              orderBy: { createdAt: "desc" },
              take: 50,
            },
          }
        : undefined,
    });
  }

  /**
   * Get all ledgers accessible to the current user (owned or collaborated)
   */
  async findAll(currentUser: CurrentUserContext) {
    return this.prisma.ledger.findMany({
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
      include: {
        _count: {
          select: {
            actions: true,
            collaborators: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Update a ledger (owner only)
   */
  async update(
    ledgerId: string,
    dto: UpdateLedgerDto,
    currentUser: CurrentUserContext,
  ) {
    await this.verifyAccess(ledgerId, currentUser.userId, "OWNER");

    return this.prisma.ledger.update({
      where: { id: ledgerId },
      data: {
        title: dto.title,
        description: dto.description,
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId,
      },
    });
  }

  /**
   * Delete a ledger (owner only)
   */
  async delete(ledgerId: string, currentUser: CurrentUserContext) {
    await this.verifyAccess(ledgerId, currentUser.userId, "OWNER");

    await this.prisma.ledger.delete({
      where: { id: ledgerId },
    });

    return { deleted: true };
  }

  /**
   * Check if user has access to a ledger with minimum required role
   * Throws ForbiddenException if access is denied
   */
  async verifyAccess(
    ledgerId: string,
    userId: string,
    requiredRole: LedgerCollaboratorRole,
  ): Promise<void> {
    const ledger = await this.prisma.ledger.findUnique({
      where: { id: ledgerId },
      include: {
        collaborators: {
          where: { userId },
        },
      },
    });

    if (!ledger) {
      throw new NotFoundException(`Ledger ${ledgerId} not found`);
    }

    // Owner has all permissions
    if (ledger.ownerUserId === userId) {
      return;
    }

    // Check collaborator role
    const collaboration = ledger.collaborators[0];
    if (!collaboration) {
      throw new ForbiddenException("Access denied to this ledger");
    }

    // Role hierarchy check
    const roleHierarchy: Record<LedgerCollaboratorRole, number> = {
      OWNER: 3,
      EDITOR: 2,
      VIEWER: 1,
    };

    if (roleHierarchy[collaboration.role] < roleHierarchy[requiredRole]) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredRole}`,
      );
    }
  }

  /**
   * Get the user's role for a ledger
   */
  async getUserRole(
    ledgerId: string,
    userId: string,
  ): Promise<LedgerCollaboratorRole | null> {
    const ledger = await this.prisma.ledger.findUnique({
      where: { id: ledgerId },
      include: {
        collaborators: {
          where: { userId },
        },
      },
    });

    if (!ledger) {
      return null;
    }

    if (ledger.ownerUserId === userId) {
      return "OWNER";
    }

    return ledger.collaborators[0]?.role || null;
  }
}
