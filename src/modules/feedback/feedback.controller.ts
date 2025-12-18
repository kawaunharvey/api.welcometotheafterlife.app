import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { FeedbackReport } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CurrentUser,
  CurrentUserContext,
} from "../auth/current-user.decorator";
import { FeedbackService } from "./feedback.service";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";

@ApiTags("feedback")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("feedback")
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: "Submit a feedback or support report" })
  @ApiCreatedResponse({ description: "Feedback report created", type: Object })
  async create(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: CurrentUserContext,
    @Req() req: Request,
  ): Promise<{ report: FeedbackReport }> {
    const report = await this.feedbackService.create(dto, user, {
      ipAddress: this.extractIp(req),
      userAgent: this.normalizeHeader(req.headers["user-agent"]),
    });

    return { report };
  }

  private extractIp(req: Request): string | undefined {
    const forwarded = req.headers["x-forwarded-for"];

    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0]?.trim();
    }

    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0];
    }

    return req.ip;
  }

  private normalizeHeader(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return value;
  }
}
