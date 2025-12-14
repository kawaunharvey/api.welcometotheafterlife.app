import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { MailgunService } from "../mailgun/mailgun.service";

export interface DonationEventData {
  paymentId: string;
  fundraisingId: string;
  amountCents: number;
  currency: string;
  status: string;
  processedAt: string;
  metadata?: {
    afterlifeMemorialId?: string;
    afterlifeFundraisingId?: string;
    donorDisplay?: string;
    message?: string;
  };
}

export interface PayoutEventData {
  payoutId: string;
  fundraisingId: string;
  amountCents: number;
  currency: string;
  status: string;
  processedAt: string;
  destinationSummary?: string;
  failureReason?: string;
}

interface NotificationContext {
  memorialSlug?: string;
  memorialName?: string;
  ownerEmail?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly mailgunService: MailgunService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async sendDonationSucceeded(event: DonationEventData): Promise<void> {
    if (!this.shouldSendEmail()) {
      this.logger.debug(
        "Email notifications disabled; skipping donation email",
      );
      return;
    }

    if (event.status !== "succeeded") {
      return;
    }

    const context = await this.getContext(event.fundraisingId);
    if (!context?.ownerEmail) {
      this.logger.warn("No owner email found for donation notification", {
        fundraisingId: event.fundraisingId,
      });
      return;
    }

    const donorName = event.metadata?.donorDisplay || "Someone";
    const memorialName = context.memorialName || "your memorial";
    const amount = this.formatAmount(event.amountCents, event.currency);
    const memorialUrl = this.buildMemorialUrl(context.memorialSlug);

    const messageParts = [
      `${donorName} just donated ${amount} to ${memorialName}.`,
    ];

    if (event.metadata?.message) {
      messageParts.push(`Donor message: ${event.metadata.message}`);
    }

    if (memorialUrl) {
      messageParts.push(`View memorial: ${memorialUrl}`);
    }

    const html = messageParts.map((line) => `<p>${line}</p>`).join("");

    await this.safeSend({
      to: context.ownerEmail,
      subject: `New donation for ${memorialName}`,
      html,
    });
  }

  async sendPayoutUpdate(
    eventType: string,
    event: PayoutEventData,
  ): Promise<void> {
    if (!this.shouldSendEmail()) {
      this.logger.debug("Email notifications disabled; skipping payout email");
      return;
    }

    const context = await this.getContext(event.fundraisingId);
    if (!context?.ownerEmail) {
      this.logger.warn("No owner email found for payout notification", {
        fundraisingId: event.fundraisingId,
      });
      return;
    }

    const memorialName = context.memorialName || "your memorial";
    const amount = this.formatAmount(event.amountCents, event.currency);
    const memorialUrl = this.buildMemorialUrl(context.memorialSlug);
    const statusLabel = this.humanizePayoutStatus(eventType, event.status);

    const messageParts = [
      `Payout ${statusLabel}: ${amount} for ${memorialName}.`,
    ];

    if (event.destinationSummary) {
      messageParts.push(`Destination: ${event.destinationSummary}`);
    }

    if (event.failureReason) {
      messageParts.push(`Reason: ${event.failureReason}`);
    }

    if (memorialUrl) {
      messageParts.push(`View memorial: ${memorialUrl}`);
    }

    const html = messageParts.map((line) => `<p>${line}</p>`).join("");

    await this.safeSend({
      to: context.ownerEmail,
      subject: `Payout ${statusLabel} for ${memorialName}`,
      html,
    });
  }

  private async getContext(
    fundraisingId: string,
  ): Promise<NotificationContext | null> {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { id: fundraisingId },
    });

    if (!program) {
      this.logger.warn("Fundraising program not found for notification", {
        fundraisingId,
      });
      return null;
    }

    const memorial = await this.prisma.memorial.findUnique({
      where: { id: program.memorialId },
    });

    if (!memorial) {
      this.logger.warn("Memorial not found for notification", {
        fundraisingId,
        memorialId: program.memorialId,
      });
      return null;
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: memorial.ownerUserId },
    });

    return {
      memorialSlug: memorial.slug,
      memorialName: memorial.displayName,
      ownerEmail: owner?.email,
    };
  }

  private async safeSend(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const from = this.getFromAddress();
    const testMode = this.isTestMode();

    try {
      await this.mailgunService.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        "o:testmode": testMode,
      });
    } catch (error) {
      this.logger.error("Failed to send notification email", {
        error,
        to: options.to,
        subject: options.subject,
      });
    }
  }

  private shouldSendEmail(): boolean {
    const flag =
      this.configService.get<string>(
        "FUNDRAISING_EMAIL_NOTIFICATIONS_ENABLED",
      ) || "false";
    const mailgunKey = this.configService.get<string>("MAILGUN_API_KEY");
    const enabled = ["true", "1", "yes", "on"].includes(flag.toLowerCase());

    if (!mailgunKey) {
      this.logger.warn("MAILGUN_API_KEY is missing; email disabled");
      return false;
    }

    return enabled;
  }

  private isTestMode(): boolean {
    const flag = this.configService.get<string>("MAILGUN_TEST_MODE") || "no";
    return ["true", "1", "yes"].includes(flag.toLowerCase());
  }

  private getFromAddress(): string {
    return (
      this.configService.get<string>("NOTIFICATIONS_FROM_EMAIL") ||
      "Welcome to the Afterlife <no-reply@thehereafter.tech>"
    );
  }

  private buildMemorialUrl(slug?: string): string | null {
    if (!slug) return null;
    const baseUrl =
      this.configService.get<string>("SHARE_BASE_URL") ||
      "https://share.welcometotheafterlife.app";
    return `${baseUrl.replace(/\/$/, "")}/memorial/${slug}`;
  }

  private formatAmount(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    const normalizedCurrency = currency || "USD";
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    });

    return formatter.format(amount);
  }

  private humanizePayoutStatus(eventType: string, status: string): string {
    if (eventType === "payout.created") return "initiated";
    if (eventType === "payout.paid") return "paid";
    if (eventType === "payout.failed") return "failed";
    if (eventType === "payout.canceled") return "canceled";
    return status.toLowerCase();
  }
}
