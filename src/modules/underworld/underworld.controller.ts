import { Controller, Get, Query } from "@nestjs/common";
import { UnderworldService } from "./underworld.service";
import {
  ListUnderworldBusinessesDto,
  UnderworldBusinessesPage,
} from "./dto/list-underworld-businesses.dto";
import { UnderworldBusiness } from "@/common";

@Controller("underworld")
export class UnderworldController {
  constructor(private readonly underworldService: UnderworldService) {}

  @Get("businesses")
  async listBusinesses(
    @Query() query: ListUnderworldBusinessesDto,
  ): Promise<UnderworldBusinessesPage<UnderworldBusiness>> {
    return this.underworldService.listBusinesses(query);
  }
}
