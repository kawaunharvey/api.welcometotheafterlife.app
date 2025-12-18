import { Injectable } from "@nestjs/common";
import {
  FeedbackSeverity,
  FeedbackStatus,
  FeedbackReport,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrentUserContext } from "../auth/current-user.decorator";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";

interface FeedbackContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateFeedbackDto,
    user: CurrentUserContext | null,
    context?: FeedbackContext,
  ): Promise<FeedbackReport> {
    const tags = dto.tags?.length ? dto.tags : [];
    const attachments = dto.attachments?.length
      ? (JSON.parse(JSON.stringify(dto.attachments)) as Prisma.InputJsonValue)
      : undefined;

    return this.prisma.feedbackReport.create({
      data: {
        userId: user?.userId,
        reporterEmail: dto.reporterEmail ?? user?.email,
        memorialId: dto.memorialId,
        fundraisingId: dto.fundraisingId,
        donationId: dto.donationId,
        payoutId: dto.payoutId,
        category: dto.category,
        sentiment: dto.sentiment,
        severity: dto.severity ?? FeedbackSeverity.MEDIUM,
        status: FeedbackStatus.NEW,
        source: dto.source,
        channel: dto.channel,
        title: dto.title,
        body: dto.body,
        tags,
        attachments,
        linkedTicketId: dto.linkedTicketId,
        followupRequired: dto.followupRequired ?? false,
        consentedToContact: dto.consentedToContact ?? false,
        appVersion: dto.appVersion,
        platform: dto.platform,
        locale: dto.locale,
        timezone: dto.timezone,
        country: dto.country,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        metadata: dto.metadata
          ? (JSON.parse(JSON.stringify(dto.metadata)) as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }
}
