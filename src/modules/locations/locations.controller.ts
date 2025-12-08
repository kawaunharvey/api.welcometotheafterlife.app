import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiExtraModels,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import {
  LocationSearchQueryDto,
  LocationSearchResultDto,
} from "./dto/location-search.dto";
import { LocationsService } from "./locations.service";

@ApiTags("locations")
@ApiExtraModels(LocationSearchResultDto)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("locations")
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get("search")
  @ApiOperation({ summary: "Search locations using Google Maps" })
  @ApiOkResponse({
    description: "Places matching the search term",
    schema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: { $ref: getSchemaPath(LocationSearchResultDto) },
        },
      },
    },
  })
  async search(@Query() query: LocationSearchQueryDto) {
    const results = await this.locationsService.searchByText(
      query.query,
      query.limit ?? 5,
    );
    return { results };
  }
}
