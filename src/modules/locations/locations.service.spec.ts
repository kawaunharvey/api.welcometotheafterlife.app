import {
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { AxiosResponse } from "axios";
import { GOOGLE_MAPS_CLIENT } from "./locations.constants";
import { LocationsService } from "./locations.service";

describe("LocationsService", () => {
  const mockClient = {
    textSearch: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === "GOOGLE_MAPS_API_KEY") return "test-key";
      return defaultValue;
    }),
  } as unknown as ConfigService;

  let service: LocationsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: GOOGLE_MAPS_CLIENT, useValue: mockClient },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = moduleRef.get<LocationsService>(LocationsService);
    jest.clearAllMocks();
  });

  it("maps results from Google Maps", async () => {
    const mockResponse: Partial<AxiosResponse> = {
      data: {
        status: "OK",
        results: [
          {
            place_id: "place-123",
            name: "Test Place",
            formatted_address: "123 Main St",
            geometry: { location: { lat: 1, lng: 2 } },
            types: ["establishment"],
          },
        ],
      },
    };

    mockClient.textSearch.mockResolvedValue(mockResponse);

    const results = await service.searchByText("test", 5);

    expect(results).toEqual([
      {
        placeId: "place-123",
        name: "Test Place",
        formattedAddress: "123 Main St",
        location: { lat: 1, lng: 2 },
        types: ["establishment"],
      },
    ]);
  });

  it("throws for empty query", async () => {
    await expect(service.searchByText("")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("handles non-OK status", async () => {
    mockClient.textSearch.mockResolvedValue({
      data: { status: "REQUEST_DENIED", error_message: "Invalid key" },
    });

    await expect(service.searchByText("test")).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
