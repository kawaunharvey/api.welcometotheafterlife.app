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
import { CollaboratorsService } from "./collaborators.service";
import { AddCollaboratorDto } from "./dto/add-collaborator.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";

@Controller("ledgers/:ledgerId/collaborators")
@UseGuards(JwtAuthGuard)
export class CollaboratorsController {
  constructor(private readonly collaboratorsService: CollaboratorsService) {}

  @Post()
  async add(
    @Param("ledgerId") ledgerId: string,
    @Body() dto: AddCollaboratorDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.collaboratorsService.add(ledgerId, dto, currentUser);
  }

  @Get()
  async findAll(
    @Param("ledgerId") ledgerId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.collaboratorsService.findAll(ledgerId, currentUser);
  }

  @Get(":collaboratorId")
  async findOne(
    @Param("collaboratorId") collaboratorId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.collaboratorsService.findOne(collaboratorId, currentUser);
  }

  @Patch(":collaboratorId")
  async updateRole(
    @Param("collaboratorId") collaboratorId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.collaboratorsService.updateRole(
      collaboratorId,
      dto,
      currentUser,
    );
  }

  @Delete(":collaboratorId")
  async remove(
    @Param("collaboratorId") collaboratorId: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.collaboratorsService.remove(collaboratorId, currentUser);
  }
}
