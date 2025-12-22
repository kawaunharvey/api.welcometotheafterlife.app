import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CurrentUser,
  type CurrentUserContext,
} from "../auth/current-user.decorator";
import { LedgerService } from "./ledger.service";
import { CreateLedgerDto } from "./dto/create-ledger.dto";
import { UpdateLedgerDto } from "./dto/update-ledger.dto";

@Controller("ledgers")
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post()
  async create(
    @Body() dto: CreateLedgerDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.ledgerService.create(dto, currentUser);
  }

  @Get()
  async findAll(@CurrentUser() currentUser: CurrentUserContext) {
    return this.ledgerService.findAll(currentUser);
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentUser() currentUser: CurrentUserContext,
    @Query("include") include?: string,
  ) {
    const includeNested = include === "all" || include === "nested";
    return this.ledgerService.findOne(id, currentUser, includeNested);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateLedgerDto,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.ledgerService.update(id, dto, currentUser);
  }

  @Delete(":id")
  async delete(
    @Param("id") id: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    return this.ledgerService.delete(id, currentUser);
  }

  @Get(":id/role")
  async getUserRole(
    @Param("id") id: string,
    @CurrentUser() currentUser: CurrentUserContext,
  ) {
    const role = await this.ledgerService.getUserRole(id, currentUser.userId);
    return { role };
  }
}
