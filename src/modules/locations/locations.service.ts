import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { Client } from "@googlemaps/google-maps-services-js";
import { GOOGLE_MAPS_CLIENT } from "./locations.constants";
import { LocationSearchResultDto } from "./dto/location-search.dto";

@Injectable()
export class LocationsService {
  private readonly apiKey: string;
  private readonly logger = new Logger(LocationsService.name);
  private readonly timeoutMs = 5000;

  constructor(
    @Inject(GOOGLE_MAPS_CLIENT) private readonly mapsClient: Client,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>("GOOGLE_MAPS_API_KEY", "");
  }

  async searchByText(
    query: string,
    limit = 5,
  ): Promise<LocationSearchResultDto[]> {
    if (!query?.trim()) {
      throw new BadRequestException("Query is required");
    }

    if (!this.apiKey) {
      throw new InternalServerErrorException(
        "Google Maps API key is not configured",
      );
    }

    try {
      const response = await this.mapsClient.textSearch({
        params: {
          query,
          key: this.apiKey,
        },
        timeout: this.timeoutMs,
      });

      const { data } = response;

      if (data.status && !["OK", "ZERO_RESULTS"].includes(data.status)) {
        this.logger.warn(
          `Google Maps responded with status ${data.status}: ${data.error_message || "no message"}`,
        );
        throw new InternalServerErrorException("Google Maps search failed");
      }

      return (data.results || [])
        .filter((result) => Boolean(result.place_id) && Boolean(result.name))
        .slice(0, limit)
        .map((result) => ({
          placeId: result.place_id as string,
          name: result.name as string,
          formattedAddress: result.formatted_address,
          location: result.geometry?.location,
          types: result.types,
          parts: this.getComponentParts(result.formatted_address!) ?? {},
        }));
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Google Maps textSearch failed: ${axiosError.message}`,
        axiosError.stack,
      );
      throw new InternalServerErrorException("Unable to fetch locations");
    }
  }

  getComponentParts(formattedAddress: string): Record<string, string> {
    const parts: Record<string, string> = {};
    const segments = formattedAddress.split(",").map((s) => s.trim());

    if (segments.length >= 1) {
      parts.street1 = segments[0];
    }
    if (segments.length >= 2) {
      parts.city = segments[1];
    }
    if (segments.length >= 3) {
      const stateZipCountry = segments[2].split(" ").map((s) => s.trim());
      if (stateZipCountry.length >= 1) {
        parts.state = stateZipCountry[0];
      }
      if (stateZipCountry.length >= 2) {
        parts.zip = stateZipCountry[1];
      }
      if (stateZipCountry.length >= 3) {
        parts.country = stateZipCountry.slice(2).join(" ");
      }
    }

    return parts;
  }
}
