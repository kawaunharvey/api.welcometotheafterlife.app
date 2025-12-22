import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import {
  CurrentUser,
  type CurrentUserContext,
} from "../../auth/current-user.decorator";
import { AttachmentsService } from "./attachments.service";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";
import { FillAttachmentDto } from "./dto/fill-attachment.dto";

@Controller("actions/:actionId/attachments")
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  async create(
    @Param("actionId") actionId: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.attachmentsService.create(actionId, dto, currentUser);
  }

  @Get()
  async findAll(
    @Param("actionId") actionId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.attachmentsService.findAll(actionId, currentUser);
  }

  @Get("empty")
  async findEmptySlots(
    @Param("actionId") actionId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.attachmentsService.findEmptySlots(actionId, currentUser);
  }

  @Get("slot/:slotKey")
  async findBySlotKey(
    @Param("actionId") actionId: string,
    @Param("slotKey") slotKey: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.attachmentsService.findBySlotKey(
      actionId,
      slotKey,
      currentUser,
    );
  }

  @Get(":attachmentId")
  async findOne(
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.attachmentsService.findOne(attachmentId, currentUser);
  }

  @Patch(":attachmentId")
  async fill(
    @Param("attachmentId") attachmentId: string,
    @Body() dto: FillAttachmentDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.attachmentsService.fill(attachmentId, dto, currentUser);
  }

  @Delete(":attachmentId")
  async delete(
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.attachmentsService.delete(attachmentId, currentUser);
  }
}
