import {
  Injectable,
  OnModuleInit,
  BeforeApplicationShutdown,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, BeforeApplicationShutdown
{
  async onModuleInit() {
    await this.$runCommandRaw({
      createIndexes: "Location",
      indexes: [
        {
          name: "point_2dsphere",
          key: { point: "2dsphere" },
        },
      ],
    });
    await this.$connect();
  }

  async beforeApplicationShutdown() {
    await this.$disconnect();
  }
}
