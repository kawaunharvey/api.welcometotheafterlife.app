import { Module } from "@nestjs/common";
import { CommonModule } from "@/common";
import { UnderworldController } from "./underworld.controller";
import { UnderworldService } from "./underworld.service";

@Module({
  imports: [CommonModule],
  controllers: [UnderworldController],
  providers: [UnderworldService],
  exports: [UnderworldService],
})
export class UnderworldModule {}
