import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { DonationStatus } from "@prisma/client";
import { sumCents } from "../../common/utils/money";
import { NotificationService } from "../notifications/notification.service";
import { FeedsService } from "../feeds/feeds.service";
import { FeedItemType } from "@prisma/client";

interface WebhookEventPayload {
  type: string;
  data: Record<string, unknown>;
  signature?: string;
  id?: string;
}

interface PaymentEventData {
  paymentId: string;
  fundraisingId: string;
  amountCents: number;
  currency: string;
  status: string;
  processedAt: string;
  metadata?: {
    afterlifeMemorialId?: string;
    afterlifeFundraisingId?: string;
    donorEmail?: string;
    donorDisplay?: string;
    message?: string;
  };
}

interface PayoutEventData {
  payoutId: string;
  fundraisingId: string;
  amountCents: number;
  currency: string;
  status: string;
  processedAt: string;
  destinationSummary?: string;
  failureReason?: string;
}

interface BeneficiaryEventData {
  beneficiaryId: string;
  connectAccountId: string;
  onboardingStatus: string;
  fundraisingId?: string;
}

@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly feedsService: FeedsService,
  ) {
    this.webhookSecret =
      this.configService.get("BILLING_WEBHOOK_SECRET") || "whsec_xxx";
  }

  async handleWebhook(payload: WebhookEventPayload): Promise<void> {
    this.logger.debug("Processing billing webhook", {
      type: payload.type,
      id: payload.id,
    });

    // Verify webhook signature (implement based on Billing Service's approach)
    if (!this.verifySignature(payload)) {
      throw new BadRequestException("Invalid webhook signature");
    }

    // Handle different event types
    switch (payload.type) {
      case "payment.succeeded":
      case "payment.failed":
      case "payment.refunded":
        await this.handlePaymentEvent(payload);
        break;

      case "payout.created":
      case "payout.paid":
      case "payout.failed":
      case "payout.canceled":
        await this.handlePayoutEvent(payload);
        break;

      case "beneficiary.onboarding.updated":
      case "account.updated":
        await this.handleBeneficiaryEvent(payload);
        break;

      default:
        this.logger.warn("Unknown webhook event type", { type: payload.type });
    }
  }

  private async handlePaymentEvent(event: WebhookEventPayload): Promise<void> {
    const data = event.data as unknown as PaymentEventData;

    this.logger.debug("Handling payment event", {
      type: event.type,
      paymentId: data.paymentId,
      status: data.status,
      amountCents: data.amountCents,
    });

    // Map payment status
    let donationStatus: DonationStatus;
    switch (data.status) {
      case "succeeded":
        donationStatus = DonationStatus.SUCCEEDED;
        break;
      case "failed":
        donationStatus = DonationStatus.FAILED;
        break;
      case "refunded":
        donationStatus = DonationStatus.REFUNDED;
        break;
      default:
        donationStatus = DonationStatus.PENDING;
    }

    // Upsert donation mirror
    const donation = await this.prisma.donationMirror.upsert({
      where: { billingPaymentId: data.paymentId },
      update: {
        status: donationStatus,
        amountCents: data.amountCents,
        currency: data.currency,
        madeAt: new Date(data.processedAt),
      },
      create: {
        fundraisingId: data.fundraisingId,
        billingPaymentId: data.paymentId,
        amountCents: data.amountCents,
        currency: data.currency,
        status: donationStatus,
        donorDisplay: data.metadata?.donorDisplay,
        message: data.metadata?.message,
        madeAt: new Date(data.processedAt),
      },
    });

    if (donationStatus === DonationStatus.SUCCEEDED) {
      const fundraising = await this.prisma.fundraisingProgram.findUnique({
        where: { id: data.fundraisingId },
        select: {
          memorialId: true,
          memorial: {
            select: {
              displayName: true,
              ownerUserId: true,
              visibility: true,
              location: true,
            },
          },
        },
      });

      if (fundraising?.memorialId) {
        const memorial = await this.prisma.memorial.findUnique({
          where: { id: fundraising.memorialId },
        });

        let donorName = "Someone";
        let donorUserId: string | null = null;
        if (data.metadata?.donorEmail) {
          const user = await this.prisma.user.findUnique({
            where: { email: data.metadata?.donorEmail },
          });
          donorName = user?.handle ?? donorName;
          donorUserId = user?.id ?? donorUserId;
        }

        await this.feedsService.createActivityFeedItem({
          type: FeedItemType.DONATION,
          fundraisingId: data.fundraisingId,
          memorialId: fundraising.memorialId,
          templatePayload: {
            actor: donorUserId
              ? { id: donorUserId, displayName: donorName }
              : { displayName: donorName },
            donation: {
              id: donation.id,
              amountCents: data.amountCents,
              currency: data.currency,
            },
            target: {
              id: fundraising.memorialId,
              displayName: memorial?.displayName ?? "a loved one",
            },
            summary: data.metadata?.message,
          },
          audienceTags: ["FOLLOWING", "FUNDRAISING"],
          audienceUserIds: fundraising.memorial?.ownerUserId
            ? [fundraising.memorial.ownerUserId]
            : [],
          lat: fundraising.memorial?.location?.lat ?? undefined,
          lng: fundraising.memorial?.location?.lng ?? undefined,
          country: fundraising.memorial?.location?.country ?? undefined,
          visibility: fundraising.memorial?.visibility,
          metadata: {
            amountCents: data.amountCents,
            currency: data.currency,
          },
        });
      }
    }

    // Recompute fundraising program totals
    await this.recomputeFundraisingTotals(data.fundraisingId);

    // Audit log
    await this.auditService.record({
      subjectType: "DonationMirror",
      subjectId: donation.id,
      action: "DONATION_MIRRORED",
      payload: { status: donationStatus, amountCents: data.amountCents },
    });

    try {
      await this.notificationService.sendDonationSucceeded(data);
    } catch (error) {
      this.logger.error("Failed to send donation notification", {
        error,
        paymentId: data.paymentId,
      });
    }

    this.logger.debug("Payment event processed successfully", {
      paymentId: data.paymentId,
      donationId: donation.id,
      status: donationStatus,
    });
  }

  private async handlePayoutEvent(event: WebhookEventPayload): Promise<void> {
    const data = event.data as unknown as PayoutEventData;

    this.logger.debug("Handling payout event", {
      type: event.type,
      payoutId: data.payoutId,
      status: data.status,
      amountCents: data.amountCents,
    });

    // Upsert payout mirror
    const payout = await this.prisma.payoutMirror.upsert({
      where: { billingPayoutId: data.payoutId },
      update: {
        status: data.status,
        completedAt: data.processedAt ? new Date(data.processedAt) : undefined,
        failureReason: data.failureReason,
        destinationSummary: data.destinationSummary,
      },
      create: {
        fundraisingId: data.fundraisingId,
        billingPayoutId: data.payoutId,
        amountCents: data.amountCents,
        currency: data.currency,
        status: data.status,
        initiatedAt: new Date(),
        completedAt: data.processedAt ? new Date(data.processedAt) : undefined,
        failureReason: data.failureReason,
        destinationSummary: data.destinationSummary,
      },
    });

    // Recompute fundraising program totals
    await this.recomputeFundraisingTotals(data.fundraisingId);

    // Audit log
    await this.auditService.record({
      subjectType: "PayoutMirror",
      subjectId: payout.id,
      action: "PAYOUT_UPDATED",
      payload: { status: data.status, amountCents: data.amountCents },
    });

    try {
      await this.notificationService.sendPayoutUpdate(event.type, data);
    } catch (error) {
      this.logger.error("Failed to send payout notification", {
        error,
        payoutId: data.payoutId,
      });
    }

    this.logger.debug("Payout event processed successfully", {
      payoutId: data.payoutId,
      payoutMirrorId: payout.id,
      status: data.status,
    });
  }

  private async handleBeneficiaryEvent(
    event: WebhookEventPayload,
  ): Promise<void> {
    const data = event.data as unknown as BeneficiaryEventData;

    this.logger.debug("Handling beneficiary event", {
      type: event.type,
      beneficiaryId: data.beneficiaryId,
      onboardingStatus: data.onboardingStatus,
    });

    // Find fundraising program by beneficiary external ID or connect account ID
    const program = await this.prisma.fundraisingProgram.findFirst({
      where: {
        OR: [
          { beneficiaryExternalId: data.beneficiaryId },
          { connectAccountId: data.connectAccountId },
        ],
      },
    });

    if (!program) {
      this.logger.warn("No fundraising program found for beneficiary", {
        beneficiaryId: data.beneficiaryId,
        connectAccountId: data.connectAccountId,
      });
      return;
    }

    // Update beneficiary onboarding status
    await this.prisma.fundraisingProgram.update({
      where: { id: program.id },
      data: {
        beneficiaryOnboardingStatus: data.onboardingStatus,
        connectAccountId: data.connectAccountId,
        beneficiaryExternalId: data.beneficiaryId,
      },
    });

    // Audit log
    await this.auditService.record({
      subjectType: "FundraisingProgram",
      subjectId: program.id,
      action: "BENEFICIARY_ONBOARDING_UPDATED",
      payload: { onboardingStatus: data.onboardingStatus },
    });

    this.logger.debug("Beneficiary event processed successfully", {
      beneficiaryId: data.beneficiaryId,
      programId: program.id,
      onboardingStatus: data.onboardingStatus,
    });
  }

  private async recomputeFundraisingTotals(
    fundraisingId: string,
  ): Promise<void> {
    // Get all donations for this fundraising program
    const donations = await this.prisma.donationMirror.findMany({
      where: { fundraisingId },
    });

    const succeededDonations = donations.filter(
      (d) => d.status === DonationStatus.SUCCEEDED,
    );
    const refundedDonations = donations.filter(
      (d) => d.status === DonationStatus.REFUNDED,
    );

    const succeededAmountCents = sumCents(
      succeededDonations.map((d) => d.amountCents),
    );
    const refundedAmountCents = sumCents(
      refundedDonations.map((d) => d.amountCents),
    );

    const currentAmountCents = succeededAmountCents - refundedAmountCents;

    // Get all paid payouts for this fundraising program
    const payouts = await this.prisma.payoutMirror.findMany({
      where: {
        fundraisingId,
        status: "PAID",
      },
    });

    const totalPayoutsCents = sumCents(payouts.map((p) => p.amountCents));

    // Find the latest donation
    const latestDonation = await this.prisma.donationMirror.findFirst({
      where: {
        fundraisingId,
        status: DonationStatus.SUCCEEDED,
      },
      orderBy: { madeAt: "desc" },
    });

    // Update fundraising program totals
    await this.prisma.fundraisingProgram.update({
      where: { id: fundraisingId },
      data: {
        currentAmountCents,
        totalPayoutsCents,
        lastPayoutAt:
          payouts.length > 0
            ? payouts.sort(
                (a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime(),
              )[0].initiatedAt
            : undefined,
      },
    });

    this.logger.debug("Fundraising totals recomputed", {
      fundraisingId,
      currentAmountCents,
      totalPayoutsCents,
      donationCount: succeededDonations.length,
      payoutCount: payouts.length,
    });
  }

  private verifySignature(payload: WebhookEventPayload): boolean {
    // TODO: Implement signature verification based on Billing Service's approach
    // This could be HMAC SHA256, JWT, or similar
    // For now, we'll just check that the secret is configured

    if (!this.webhookSecret || this.webhookSecret === "whsec_xxx") {
      this.logger.warn(
        "Webhook secret not configured, skipping signature verification",
      );
      return true; // Allow in development
    }

    // Example HMAC verification (adapt to actual implementation):
    // const expectedSignature = crypto
    //   .createHmac('sha256', this.webhookSecret)
    //   .update(JSON.stringify(payload.data))
    //   .digest('hex');
    //
    // return crypto.timingSafeEqual(
    //   Buffer.from(expectedSignature, 'hex'),
    //   Buffer.from(payload.signature || '', 'hex')
    // );

    return true; // For now, always pass verification
  }
}
