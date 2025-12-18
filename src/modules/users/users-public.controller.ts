import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { HandleAvailabilityQueryDto } from "./dto/user.dto";

@ApiTags("Users")
@Controller("users")
export class UsersPublicController {
  constructor(private readonly usersService: UsersService) {}

  @Get("handle-availability")
  @ApiOperation({ summary: "Check if a handle is available" })
  @ApiResponse({ status: 200, description: "Handle availability" })
  async checkHandleAvailability(
    @Query() query: HandleAvailabilityQueryDto,
  ): Promise<{ handle: string; available: boolean }> {
    const result = await this.usersService.isHandleAvailable(query.handle);
    return { handle: query.handle, available: result.available };
  }
}
