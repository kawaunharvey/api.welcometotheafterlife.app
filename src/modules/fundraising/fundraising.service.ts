import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BillingClient } from "./clients/billing.client";
import {
  CreateFundraisingProgramDto,
  UpdateFundraisingProgramDto,
  CreateDonationCheckoutDto,
  CreateDonationPaymentIntentDto,
  StartBeneficiaryOnboardingDto,
  RequestPayoutDto,
  FundraisingProgramSummaryDto,
  DonationListItemDto,
  PayoutListItemDto,
  BeneficiaryStatusDto,
} from "./dto/fundraising.dto";
import {
  assertCents,
  assertPositiveCents,
  calculateAvailableForPayout,
  validateCurrency,
  sumCents,
} from "../../common/utils/money";
import { assertMemorialOwnerOrAdmin } from "../../common/utils/permissions";
import {
  FundraisingProgram,
  FundraisingStatus,
  DonationStatus,
} from "@prisma/client";

@Injectable()
export class FundraisingService {
  private readonly logger = new Logger(FundraisingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly billingClient: BillingClient,
    private readonly configService: ConfigService,
  ) {}

  async createProgram(
    dto: CreateFundraisingProgramDto,
    userId: string,
  ): Promise<FundraisingProgram> {
    // Validate memorial exists and user has permission
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: dto.memorialId },
    });

    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    assertMemorialOwnerOrAdmin(userId, memorial);

    // Validate amounts if provided
    if (dto.goalAmountCents !== undefined) {
      assertCents(dto.goalAmountCents);
    }

    validateCurrency(dto.currency || "USD");

    // Ensure one program per memorial
    const existing = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId: dto.memorialId },
    });

    if (existing) {
      throw new ConflictException("Memorial already has a fundraising program");
    }

    const program = await this.prisma.fundraisingProgram.create({
      data: {
        memorialId: dto.memorialId,
        purpose: dto.purpose,
        goalAmountCents: dto.goalAmountCents,
        currency: dto.currency || "USD",
        beneficiaryType: dto.beneficiaryType,
        beneficiaryName: dto.beneficiaryName,
        feePlanId: dto.feePlanId,
        status: FundraisingStatus.ACTIVE,
        currentAmountCents: 0,
        totalPayoutsCents: 0,
        beneficiaryOnboardingStatus: "NOT_STARTED",
      },
    });

    await this.auditService.record({
      subjectType: "FundraisingProgram",
      subjectId: program.id,
      actorUserId: userId,
      action: "FUNDRAISING_CREATED",
      payload: { purpose: dto.purpose, goalAmountCents: dto.goalAmountCents },
    });

    this.logger.debug("Fundraising program created", {
      programId: program.id,
      memorialId: dto.memorialId,
      goalAmountCents: dto.goalAmountCents,
    });

    return program;
  }

  async getProgramByMemorial(
    memorialId: string,
  ): Promise<FundraisingProgram | null> {
    return this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: {
        memorial: true,
      },
    });
  }

  async updateProgram(
    memorialId: string,
    dto: UpdateFundraisingProgramDto,
    userId: string,
  ): Promise<FundraisingProgram> {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    // Validate amounts if provided
    if (dto.goalAmountCents !== undefined) {
      assertCents(dto.goalAmountCents);
    }

    const updatedProgram = await this.prisma.fundraisingProgram.update({
      where: { memorialId },
      data: {
        purpose: dto.purpose,
        goalAmountCents: dto.goalAmountCents,
        status: dto.status as FundraisingStatus,
        beneficiaryType: dto.beneficiaryType,
        beneficiaryName: dto.beneficiaryName,
        feePlanId: dto.feePlanId,
      },
    });

    await this.auditService.record({
      subjectType: "FundraisingProgram",
      subjectId: program.id,
      actorUserId: userId,
      action: "FUNDRAISING_UPDATED",
      payload: dto,
    });

    this.logger.debug("Fundraising program updated", {
      programId: program.id,
      memorialId,
      changes: dto,
    });

    return updatedProgram;
  }

  async computeSummary(
    memorialId: string,
  ): Promise<FundraisingProgramSummaryDto> {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: {
        donations: {
          where: { status: DonationStatus.SUCCEEDED },
          orderBy: { madeAt: "desc" },
        },
        payouts: {
          where: { status: "PAID" },
        },
      },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    const succeededDonations = program.donations.filter(
      (d) => d.status === DonationStatus.SUCCEEDED,
    );
    const paidPayouts = program.payouts.filter((p) => p.status === "PAID");

    const currentAmountCents = sumCents(
      succeededDonations.map((d) => d.amountCents),
    );
    const totalPayoutsCents = sumCents(paidPayouts.map((p) => p.amountCents));
    const availableForPayoutCents = calculateAvailableForPayout(
      currentAmountCents,
      totalPayoutsCents,
    );

    const donationCount = succeededDonations.length;
    const lastDonationAt = succeededDonations[0]?.madeAt?.toISOString() || null;

    return {
      memorialId,
      status: program.status,
      goalAmountCents: program.goalAmountCents,
      currentAmountCents,
      totalPayoutsCents,
      availableForPayoutCents,
      currency: program.currency,
      donationCount,
      lastDonationAt,
      beneficiaryOnboardingStatus:
        program.beneficiaryOnboardingStatus || "NOT_STARTED",
    };
  }

  async listDonations(
    memorialId: string,
    limit = 20,
    cursor?: string,
  ): Promise<DonationListItemDto[]> {
    const program = await this.getProgramByMemorial(memorialId);

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    const donations = await this.prisma.donationMirror.findMany({
      where: {
        fundraisingId: program.id,
        status: DonationStatus.SUCCEEDED,
      },
      orderBy: { madeAt: "desc" },
      take: limit,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    return donations.map((donation) => ({
      donorDisplay: donation.donorDisplay || "Anonymous",
      message: donation.message,
      amountCents: donation.amountCents,
      currency: donation.currency,
      madeAt: donation.madeAt.toISOString(),
    }));
  }

  async listPayouts(
    memorialId: string,
    limit = 20,
    cursor?: string,
  ): Promise<PayoutListItemDto[]> {
    const program = await this.getProgramByMemorial(memorialId);

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    const payouts = await this.prisma.payoutMirror.findMany({
      where: { fundraisingId: program.id },
      orderBy: { initiatedAt: "desc" },
      take: limit,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    return payouts.map((payout) => ({
      billingPayoutId: payout.billingPayoutId,
      amountCents: payout.amountCents,
      currency: payout.currency,
      status: payout.status,
      initiatedAt: payout.initiatedAt.toISOString(),
      completedAt: payout.completedAt?.toISOString() || null,
      destinationSummary: payout.destinationSummary,
      failureReason: payout.failureReason,
    }));
  }

  async createCheckout(
    memorialId: string,
    dto: CreateDonationCheckoutDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<{ checkoutUrl: string; paymentId: string }> {
    const program = await this.getProgramByMemorial(memorialId);

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    if (program.status !== FundraisingStatus.ACTIVE) {
      throw new BadRequestException("Fundraising program is not active");
    }

    // Validate amounts
    assertPositiveCents(dto.amountCents);
    validateCurrency(dto.currency || "USD");

    if (dto.currency && dto.currency !== program.currency) {
      throw new BadRequestException(
        `Currency mismatch. Program uses ${program.currency}, but got ${dto.currency}`,
      );
    }

    // Build URLs
    const baseUrl =
      this.configService.get("SERVICE_PUBLIC_BASE_URL") ||
      "http://localhost:4000";
    const returnUrl =
      dto.returnUrl || `${baseUrl}/thank-you?memorial=${memorialId}`;
    const cancelUrl =
      dto.cancelUrl || `${baseUrl}/cancelled?memorial=${memorialId}`;

    const checkoutRequest = {
      kind: "donation" as const,
      amountCents: dto.amountCents,
      currency: dto.currency || "USD",
      memorialId,
      fundraisingId: program.id,
      connectAccountId: program.connectAccountId || undefined,
      feePlanId: program.feePlanId || undefined,
      metadata: {
        afterlifeMemorialId: memorialId,
        afterlifeFundraisingId: program.id,
        donorDisplay: dto.donorDisplay,
        message: dto.message,
      },
      returnUrl,
      cancelUrl,
    };

    const response = await this.billingClient.createPaymentOrCheckout(
      checkoutRequest,
      idempotencyKey,
    );

    this.logger.debug("Donation checkout created", {
      memorialId,
      amountCents: dto.amountCents,
      paymentId: response.paymentId,
    });

    return response;
  }

  async createPaymentIntent(
    memorialId: string,
    dto: CreateDonationPaymentIntentDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    publishableKey: string;
    ephemeralKey?: string;
  }> {
    const program = await this.getProgramByMemorial(memorialId);

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    if (program.status !== FundraisingStatus.ACTIVE) {
      throw new BadRequestException("Fundraising program is not active");
    }

    // Validate amounts
    assertPositiveCents(dto.amountCents);
    validateCurrency(dto.currency || "USD");

    if (dto.currency && dto.currency !== program.currency) {
      throw new BadRequestException(
        `Currency mismatch. Program uses ${program.currency}, but got ${dto.currency}`,
      );
    }

    const paymentIntentRequest = {
      kind: "donation" as const,
      amountCents: dto.amountCents,
      currency: dto.currency || "USD",
      memorialId,
      fundraisingId: program.id,
      connectAccountId: program.connectAccountId || undefined,
      feePlanId: program.feePlanId || undefined,
      metadata: {
        afterlifeMemorialId: memorialId,
        afterlifeFundraisingId: program.id,
        donorDisplay: dto.donorDisplay,
        message: dto.message,
      },
    };

    const response = await this.billingClient.createPaymentIntent(
      paymentIntentRequest,
      idempotencyKey,
    );

    this.logger.debug("Donation payment intent created", {
      memorialId,
      amountCents: dto.amountCents,
      paymentIntentId: response.paymentIntentId,
    });

    return response;
  }

  async startBeneficiaryOnboarding(
    memorialId: string,
    dto: StartBeneficiaryOnboardingDto,
    userId: string,
  ): Promise<{ onboardingUrl: string; beneficiaryOnboardingStatus: string }> {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    const onboardingRequest = {
      memorialId,
      fundraisingId: program.id,
      beneficiaryType: dto.beneficiaryType,
      beneficiaryName: dto.beneficiaryName,
      email: dto.email,
      metadata: {
        afterlifeMemorialId: memorialId,
        afterlifeFundraisingId: program.id,
      },
    };

    const response =
      await this.billingClient.startBeneficiaryOnboarding(onboardingRequest);

    // Update program with onboarding information
    await this.prisma.fundraisingProgram.update({
      where: { memorialId },
      data: {
        beneficiaryType: dto.beneficiaryType,
        beneficiaryName: dto.beneficiaryName,
        beneficiaryExternalId: response.beneficiaryId,
        connectAccountId: response.connectAccountId,
        beneficiaryOnboardingStatus: response.onboardingStatus,
      },
    });

    await this.auditService.record({
      subjectType: "FundraisingProgram",
      subjectId: program.id,
      actorUserId: userId,
      action: "BENEFICIARY_ONBOARDING_STARTED",
      payload: {
        beneficiaryType: dto.beneficiaryType,
        beneficiaryName: dto.beneficiaryName,
      },
    });

    this.logger.debug("Beneficiary onboarding started", {
      memorialId,
      beneficiaryId: response.beneficiaryId,
      onboardingStatus: response.onboardingStatus,
    });

    return {
      onboardingUrl: response.onboardingUrl,
      beneficiaryOnboardingStatus: response.onboardingStatus,
    };
  }

  async getBeneficiaryStatus(
    memorialId: string,
  ): Promise<BeneficiaryStatusDto> {
    const program = await this.getProgramByMemorial(memorialId);

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    return {
      beneficiaryType: program.beneficiaryType,
      beneficiaryName: program.beneficiaryName,
      beneficiaryOnboardingStatus:
        program.beneficiaryOnboardingStatus || "NOT_STARTED",
      connectAccountId: program.connectAccountId,
    };
  }

  async requestPayout(
    memorialId: string,
    dto: RequestPayoutDto,
    userId: string,
  ): Promise<PayoutListItemDto> {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    // Validate payout preconditions
    if (program.status === FundraisingStatus.PAUSED) {
      throw new BadRequestException(
        "Cannot request payout when fundraising is paused",
      );
    }

    if (program.beneficiaryOnboardingStatus !== "VERIFIED") {
      throw new BadRequestException(
        "Beneficiary onboarding must be verified before payouts",
      );
    }

    if (!program.connectAccountId) {
      throw new BadRequestException(
        "Connect account ID is required for payouts",
      );
    }

    // Validate amounts
    assertPositiveCents(dto.amountCents);
    validateCurrency(dto.currency || "USD");

    if (dto.currency && dto.currency !== program.currency) {
      throw new BadRequestException(
        `Currency mismatch. Program uses ${program.currency}, but got ${dto.currency}`,
      );
    }

    // Check available amount
    const summary = await this.computeSummary(memorialId);
    if (dto.amountCents > summary.availableForPayoutCents) {
      throw new BadRequestException(
        `Insufficient funds. Available: ${summary.availableForPayoutCents} cents, requested: ${dto.amountCents} cents`,
      );
    }

    const payoutRequest = {
      fundraisingId: program.id,
      memorialId,
      amountCents: dto.amountCents,
      currency: dto.currency || "USD",
      connectAccountId: program.connectAccountId,
      metadata: {
        afterlifeMemorialId: memorialId,
        afterlifeFundraisingId: program.id,
      },
      note: dto.note || "",
    };

    const response = await this.billingClient.requestPayout(payoutRequest);

    // Create payout mirror
    const payoutMirror = await this.prisma.payoutMirror.create({
      data: {
        fundraisingId: program.id,
        billingPayoutId: response.payoutId,
        amountCents: dto.amountCents,
        currency: dto.currency || "USD",
        status: response.status,
        initiatedAt: new Date(),
        destinationSummary: response.destinationSummary,
      },
    });

    await this.auditService.record({
      subjectType: "FundraisingProgram",
      subjectId: program.id,
      actorUserId: userId,
      action: "PAYOUT_REQUESTED",
      payload: { amountCents: dto.amountCents, payoutId: response.payoutId },
    });

    this.logger.debug("Payout requested", {
      memorialId,
      amountCents: dto.amountCents,
      payoutId: response.payoutId,
      status: response.status,
    });

    return {
      billingPayoutId: payoutMirror.billingPayoutId,
      amountCents: payoutMirror.amountCents,
      currency: payoutMirror.currency,
      status: payoutMirror.status,
      initiatedAt: payoutMirror.initiatedAt.toISOString(),
      completedAt: null,
      destinationSummary: payoutMirror.destinationSummary,
      failureReason: null,
    };
  }
}
