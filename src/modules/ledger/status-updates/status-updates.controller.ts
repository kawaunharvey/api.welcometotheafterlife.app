import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { LedgerStatusUpdateType } from "@prisma/client";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import {
  CurrentUser,
  type CurrentUserContext,
} from "../../auth/current-user.decorator";
import { StatusUpdatesService } from "./status-updates.service";
import { CreateNoteDto } from "./dto/create-note.dto";

@Controller()
@UseGuards(JwtAuthGuard)
export class StatusUpdatesController {
  constructor(private readonly statusUpdatesService: StatusUpdatesService) {}

  // Ledger-level status updates
  @Post("ledgers/:ledgerId/status-updates")
  async createNote(
    @Param("ledgerId") ledgerId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.statusUpdatesService.createNote(ledgerId, dto, currentUser);
  }

  @Get("ledgers/:ledgerId/status-updates")
  async findAll(
    @Param("ledgerId") ledgerId: string,
    @CurrentUser() currentUser: CurrentUserContext,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
    @Query("type") type?: LedgerStatusUpdateType,
  ) {
    return this.statusUpdatesService.findAll(ledgerId, currentUser, {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor,
      type,
    });
  }

  // Action-level status updates
  @Get("actions/:actionId/status-updates")
  async findByAction(
    @Param("actionId") actionId: string,
    @CurrentUser() currentUser: CurrentUserContext,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.statusUpdatesService.findByAction(actionId, currentUser, {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  // Global recent updates
  @Get("status-updates/recent")
  async findRecent(
    @CurrentUser() currentUser: CurrentUserContext,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.statusUpdatesService.findRecent(currentUser, {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      cursor,
    });
  }

  // Single status update
  @Get("status-updates/:updateId")
  async findOne(
    @Param("updateId") updateId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.statusUpdatesService.findOne(updateId, currentUser);
  }
}
