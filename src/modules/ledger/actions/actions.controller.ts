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
import { ActionsService } from "./actions.service";
import { CreateActionDto } from "./dto/create-action.dto";
import { UpdateActionDto } from "./dto/update-action.dto";

@Controller("ledgers/:ledgerId/actions")
@UseGuards(JwtAuthGuard)
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post()
  async create(
    @Param("ledgerId") ledgerId: string,
    @Body() dto: CreateActionDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.actionsService.create(ledgerId, dto, currentUser);
  }

  @Get()
  async findAll(
    @Param("ledgerId") ledgerId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.actionsService.findAll(ledgerId, currentUser);
  }

  @Get(":actionId")
  async findOne(
    @Param("actionId") actionId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.actionsService.findOne(actionId, currentUser);
  }

  @Patch(":actionId")
  async update(
    @Param("actionId") actionId: string,
    @Body() dto: UpdateActionDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.actionsService.update(actionId, dto, currentUser);
  }

  @Delete(":actionId")
  async delete(
    @Param("actionId") actionId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.actionsService.delete(actionId, currentUser);
  }
}
