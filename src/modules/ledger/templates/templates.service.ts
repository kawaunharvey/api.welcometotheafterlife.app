import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import type { CurrentUserContext } from "../../auth/current-user.decorator";
import { LedgerService } from "../ledger.service";
import {
  ACTION_DEFINITIONS,
  TEMPLATE_DEFINITIONS,
  type ActionDefinition,
} from "./action-definitions";
import type { ApplyCustomActionsDto } from "./dto/apply-template.dto";
import type {
  ActionPreviewDto,
  AppliedTemplateResultDto,
} from "./dto/template-response.dto";

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Get all available templates
   */
  getTemplates() {
    return TEMPLATE_DEFINITIONS.map((template) => ({
      template,
      actions: this.previewActions(template.actionTypes),
    }));
  }

  /**
   * Get a single template by ID
   */
  getTemplate(templateId: string) {
    const template = TEMPLATE_DEFINITIONS.find((t) => t.id === templateId);
    if (!template) {
      throw new BadRequestException(`Template ${templateId} not found`);
    }

    return {
      template,
      actions: this.previewActions(template.actionTypes),
    };
  }

  /**
   * Get all available action definitions
   */
  getActionDefinitions() {
    return Object.entries(ACTION_DEFINITIONS).map(([type, definition]) => ({
      ...definition,
      type,
    }));
  }

  /**
   * Preview what actions would be created from a template (without creating them)
   */
  private previewActions(actionTypes: string[]): ActionPreviewDto[] {
    return actionTypes.map((type) => {
      const definition = ACTION_DEFINITIONS[type];
      if (!definition) {
        throw new BadRequestException(`Action type ${type} not found`);
      }

      return {
        type,
        title: definition.title,
        description: definition.description,
        expectedAttachments: definition.expectedAttachments.map((att) => ({
          type: att.type,
          slotKey: att.slotKey,
          required: att.required,
          description: att.description,
        })),
      };
    });
  }

  /**
   * Apply a template to a ledger - creates actions and attachment slots
   */
  async applyTemplate(
    ledgerId: string,
    templateId: string,
    currentUser: CurrentUserContext,
  ): Promise<AppliedTemplateResultDto> {
    // Verify editor access
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "EDITOR",
    );

    const template = TEMPLATE_DEFINITIONS.find((t) => t.id === templateId);
    if (!template) {
      throw new BadRequestException(`Template ${templateId} not found`);
    }

    return this.createActionsFromDefinitions(
      ledgerId,
      template.actionTypes,
      currentUser,
    );
  }

  /**
   * Apply custom actions to a ledger
   */
  async applyCustomActions(
    ledgerId: string,
    dto: ApplyCustomActionsDto,
    currentUser: CurrentUserContext,
  ): Promise<AppliedTemplateResultDto> {
    // Verify editor access
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "EDITOR",
    );

    return this.createActionsFromDefinitions(
      ledgerId,
      dto.actionTypes,
      currentUser,
    );
  }

  /**
   * Create actions and their expected attachment slots from action definitions
   */
  private async createActionsFromDefinitions(
    ledgerId: string,
    actionTypes: string[],
    currentUser: CurrentUserContext,
  ): Promise<AppliedTemplateResultDto> {
    const createdActions: {
      id: string;
      title: string;
      type: string;
      attachmentSlotsCreated: number;
    }[] = [];

    // Create each action with its attachment slots
    for (const actionType of actionTypes) {
      const definition = ACTION_DEFINITIONS[actionType];
      if (!definition) {
        throw new BadRequestException(`Action type ${actionType} not found`);
      }

      // Create action
      const action = await this.prisma.ledgerAction.create({
        data: {
          ledgerId,
          title: definition.title,
          description: definition.description,
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
          message: `Action "${action.title}" created from template`,
          metadata: {
            actionType,
            fromTemplate: true,
          },
        },
      });

      // Create empty attachment slots for expected attachments
      let slotsCreated = 0;
      for (const slotDef of definition.expectedAttachments) {
        await this.prisma.ledgerAttachment.create({
          data: {
            actionId: action.id,
            type: slotDef.type,
            slotKey: slotDef.slotKey,
            data: null, // Empty slot to be filled later
            creatorUserId: currentUser.userId,
            creatorEmail: currentUser.email,
          },
        });
        slotsCreated++;
      }

      createdActions.push({
        id: action.id,
        title: action.title,
        type: actionType,
        attachmentSlotsCreated: slotsCreated,
      });
    }

    return {
      ledgerId,
      actionsCreated: createdActions.length,
      actions: createdActions,
    };
  }

  /**
   * Suggest actions based on ledger context (can be enhanced with AI later)
   */
  async suggestActions(
    ledgerId: string,
    currentUser: CurrentUserContext,
  ): Promise<ActionPreviewDto[]> {
    // Verify viewer access
    await this.ledgerService.verifyAccess(
      ledgerId,
      currentUser.userId,
      "VIEWER",
    );

    // Get ledger with context
    const ledger = await this.prisma.ledger.findUniqueOrThrow({
      where: { id: ledgerId },
      include: {
        actions: {
          include: {
            attachments: true,
          },
        },
      },
    });

    // Simple heuristic-based suggestions (can be enhanced with AI)
    const suggestions: string[] = [];

    // Check for unfilled attachment slots that need follow-up
    const hasUnderworldQuery = ledger.actions.some((action) =>
      action.attachments.some(
        (att) => att.type === "UNDERWORLD_QUERY" && att.data !== null,
      ),
    );

    const hasBusinessSelected = ledger.actions.some((action) =>
      action.attachments.some(
        (att) =>
          att.type === "UNDERWORLD_BUSINESS_REFERENCE" && att.data !== null,
      ),
    );

    // If user has searched for services but not selected one, suggest selection
    if (hasUnderworldQuery && !hasBusinessSelected) {
      // Already handled by existing empty slots
    }

    // Suggest coordination if multiple actions exist
    if (ledger.actions.length > 2) {
      const hasCoordination = ledger.actions.some((a) =>
        a.title.toLowerCase().includes("coordinate"),
      );
      if (!hasCoordination) {
        suggestions.push("COORDINATE_WITH_FAMILY");
      }
    }

    // Suggest memorial content creation
    const hasMemorialContent = ledger.actions.some(
      (a) =>
        a.title.toLowerCase().includes("obituary") ||
        a.title.toLowerCase().includes("photo"),
    );
    if (!hasMemorialContent && ledger.linkedEntityType === "memorial") {
      suggestions.push("PUBLISH_OBITUARY");
      suggestions.push("COLLECT_PHOTOS");
    }

    return this.previewActions(suggestions);
  }
}
