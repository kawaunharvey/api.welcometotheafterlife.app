import {
  Controller,
  Get,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { DecoratorService } from "./decorator.service";
import {
  DecoratorQueryDto,
  DecoratorResponseDto,
  PaginatedDecoratorsResponseDto,
} from "./dto/decorator.dto";

@Controller("decorators")
export class DecoratorController {
  constructor(private readonly decoratorService: DecoratorService) {}

  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async listDecorators(
    @Query() query: DecoratorQueryDto,
  ): Promise<PaginatedDecoratorsResponseDto> {
    return this.decoratorService.list(query);
  }

  @Get(":id")
  async getDecorator(@Param("id") id: string): Promise<DecoratorResponseDto> {
    return this.decoratorService.getById(id);
  }
}
