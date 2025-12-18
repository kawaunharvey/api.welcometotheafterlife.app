import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { DecoratorService } from "./decorator.service";
import { DecoratorController } from "./decorator.controller";

@Module({
  imports: [PrismaModule],
  providers: [DecoratorService],
  controllers: [DecoratorController],
  exports: [DecoratorService],
})
export class DecoratorModule {}
