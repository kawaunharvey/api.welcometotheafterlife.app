import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import {
  CurrentUser,
  type CurrentUserContext,
} from "../../auth/current-user.decorator";
import { TemplatesService } from "./templates.service";
import {
  ApplyCustomActionsDto,
  ApplyTemplateDto,
} from "./dto/apply-template.dto";

@Controller()
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  // Get all templates (no auth required for browsing)
  @Get("templates")
  getTemplates() {
    return this.templatesService.getTemplates();
  }

  // Get single template
  @Get("templates/:templateId")
  getTemplate(@Param("templateId") templateId: string) {
    return this.templatesService.getTemplate(templateId);
  }

  // Get all action definitions
  @Get("action-definitions")
  getActionDefinitions() {
    return this.templatesService.getActionDefinitions();
  }

  // Apply a template to a ledger
  @Post("ledgers/:ledgerId/apply-template")
  async applyTemplate(
    @Param("ledgerId") ledgerId: string,
    @Body() dto: ApplyTemplateDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.templatesService.applyTemplate(
      ledgerId,
      dto.templateId,
      currentUser,
    );
  }

  // Apply custom actions to a ledger
  @Post("ledgers/:ledgerId/apply-actions")
  async applyCustomActions(
    @Param("ledgerId") ledgerId: string,
    @Body() dto: ApplyCustomActionsDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.templatesService.applyCustomActions(ledgerId, dto, currentUser);
  }

  // Get AI/heuristic suggestions for a ledger
  @Get("ledgers/:ledgerId/suggestions")
  async suggestActions(
    @Param("ledgerId") ledgerId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.templatesService.suggestActions(ledgerId, currentUser);
  }
}
