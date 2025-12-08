import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Client } from "@googlemaps/google-maps-services-js";
import { LocationsController } from "./locations.controller";
import { LocationsService } from "./locations.service";
import { GOOGLE_MAPS_CLIENT } from "./locations.constants";

@Module({
  imports: [ConfigModule],
  controllers: [LocationsController],
  providers: [
    LocationsService,
    {
      provide: GOOGLE_MAPS_CLIENT,
      useFactory: () => new Client({}),
    },
  ],
  exports: [LocationsService],
})
export class LocationsModule {}
