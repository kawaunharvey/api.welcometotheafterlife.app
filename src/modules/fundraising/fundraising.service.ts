import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BillingClient } from "../../common/http-client/billing-service.client";
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
  StartFinancialConnectionsSessionDto,
  QuoteFeesDto,
  FeeQuoteDto,
  PayoutMethodDto,
} from "./dto/fundraising.dto";
import {
  assertCents,
  assertPositiveCents,
  calculateAvailableForPayout,
  validateCurrency,
  sumCents,
} from "../../common/utils/money";
import { Request } from "express";
import { assertMemorialOwnerOrAdmin } from "../../common/utils/permissions";
import {
  FundraisingProgram,
  FundraisingStatus,
  DonationStatus,
  PayoutMethod,
  PayoutMirror,
  FeedItemType,
} from "@prisma/client";
import { FeedsService } from "../feeds/feeds.service";

@Injectable()
export class FundraisingService {
  private readonly logger = new Logger(FundraisingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly billingClient: BillingClient,
    private readonly configService: ConfigService,
    private readonly feedsService: FeedsService,
  ) {}

  private computeDonationPricing(input: {
    amountCents: number;
    tipCents: number;
    coverPlatformFee: boolean;
  }): {
    amountCents: number;
    tipCents: number;
    platformFeeCents: number;
    stripeFeeCents: number;
    totalChargeCents: number;
    netBeneficiaryCents: number;
    coversPlatformFee: boolean;
    currency: string;
  } {
    assertPositiveCents(input.amountCents);
    assertCents(input.tipCents);

    this.logger.debug(
      `Pricing input: amount=${input.amountCents} tip=${input.tipCents} coverPlatformFee=${input.coverPlatformFee}`,
    );

    const currency = "USD";
    const platformFeeRate = Number(
      this.configService.get<string>("PLATFORM_FEE_RATE") ?? "0.04",
    );
    const stripeFeeRate = Number(
      this.configService.get<string>("STRIPE_FEE_RATE") ?? "0.029",
    );
    const stripeFeeFixedCents = Number(
      this.configService.get<string>("STRIPE_FEE_FIXED_CENTS") ?? "30",
    );

    const platformFeeCents = Math.round(input.amountCents * platformFeeRate);

    if (input.coverPlatformFee) {
      const baseWithPlatform =
        input.amountCents + input.tipCents + platformFeeCents;
      const totalChargeCents = Math.ceil(
        (baseWithPlatform + stripeFeeFixedCents) / (1 - stripeFeeRate),
      );
      const stripeFeeCents = totalChargeCents - baseWithPlatform;

      return {
        amountCents: input.amountCents,
        tipCents: input.tipCents,
        platformFeeCents,
        stripeFeeCents,
        totalChargeCents,
        netBeneficiaryCents: input.amountCents,
        coversPlatformFee: true,
        currency,
      };
    }

    const donorBaseCents = input.amountCents + input.tipCents;
    const stripeFeeCents = Math.round(
      donorBaseCents * stripeFeeRate + stripeFeeFixedCents,
    );

    return {
      amountCents: input.amountCents,
      tipCents: input.tipCents,
      platformFeeCents,
      stripeFeeCents,
      totalChargeCents: donorBaseCents,
      netBeneficiaryCents: Math.max(
        0,
        donorBaseCents - stripeFeeCents - platformFeeCents - input.tipCents,
      ),
      coversPlatformFee: false,
      currency,
    };
  }

  async quoteFees(dto: QuoteFeesDto): Promise<FeeQuoteDto> {
    const pricing = this.computeDonationPricing({
      amountCents: dto.amountCents,
      tipCents: dto.tipCents ?? 0,
      coverPlatformFee: !!dto.coverPlatformFee,
    });

    this.logger.debug(
      `Quoted fees: amount=${pricing.amountCents} tip=${pricing.tipCents} platformFee=${pricing.platformFeeCents} stripeFee=${pricing.stripeFeeCents} totalCharge=${pricing.totalChargeCents} net=${pricing.netBeneficiaryCents} coverPlatformFee=${pricing.coversPlatformFee}`,
    );

    return {
      amountCents: dto.amountCents,
      tipCents: pricing.tipCents,
      platformFeeCents: pricing.platformFeeCents,
      stripeFeeCents: pricing.stripeFeeCents,
      totalChargeCents: pricing.totalChargeCents,
      netBeneficiaryCents: pricing.netBeneficiaryCents,
      currency: pricing.currency,
      coversPlatformFee: pricing.coversPlatformFee,
    };
  }

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

    await this.feedsService.createActivityFeedItem({
      type: FeedItemType.FUNDRAISER_UPDATE,
      memorialId: dto.memorialId,
      fundraisingId: program.id,
      actorUserId: userId,
      title: "Fundraiser created",
      body: dto.purpose,
      audienceTags: ["FOLLOWING", "FUNDRAISING"],
      audienceUserIds: [memorial.ownerUserId],
      lat: memorial.location?.lat ?? undefined,
      lng: memorial.location?.lng ?? undefined,
      country: memorial.location?.country ?? undefined,
      visibility: memorial.visibility,
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
  ): Promise<
    (FundraisingProgram & { payoutMethod: PayoutMethodDto | null }) | null
  > {
    return this.prisma.fundraisingProgram
      .findUnique({
        where: { memorialId },
        include: {
          memorial: true,
          payoutMethod: true,
        },
      })
      .then((program) =>
        program
          ? {
              ...program,
              payoutMethod: this.toPayoutMethodDto(
                program.payoutMethod as PayoutMethod | null,
              ),
            }
          : null,
      );
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

    await this.feedsService.createActivityFeedItem({
      type: FeedItemType.FUNDRAISER_UPDATE,
      memorialId,
      fundraisingId: program.id,
      actorUserId: userId,
      title: "Fundraiser updated",
      body: dto.purpose ?? program.purpose,
      audienceTags: ["FOLLOWING", "FUNDRAISING"],
      audienceUserIds: [program.memorial.ownerUserId],
      lat: program.memorial.location?.lat ?? undefined,
      lng: program.memorial.location?.lng ?? undefined,
      country: program.memorial.location?.country ?? undefined,
      visibility: program.memorial.visibility,
      metadata: {
        status: dto.status ?? program.status,
        goalAmountCents: dto.goalAmountCents,
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
    const currency = (dto.currency || "USD").toUpperCase();

    assertPositiveCents(dto.amountCents);
    validateCurrency(currency);

    if (currency !== program.currency) {
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
    const currency = (dto.currency || "USD").toUpperCase();

    assertPositiveCents(dto.amountCents);
    validateCurrency(currency);

    if (currency !== program.currency) {
      throw new BadRequestException(
        `Currency mismatch. Program uses ${program.currency}, but got ${dto.currency}`,
      );
    }

    const donorDisplay = dto.isAnonymous
      ? "Anonymous"
      : dto.donorDisplay || dto.donorName;

    const pricing = this.computeDonationPricing({
      amountCents: dto.amountCents,
      tipCents: dto.tipCents ?? 0,
      coverPlatformFee: !!dto.coverPlatformFee,
    });

    this.logger.debug(
      `Building PI with pricing: amount=${pricing.amountCents} tip=${pricing.tipCents} platformFee=${pricing.platformFeeCents} stripeFee=${pricing.stripeFeeCents} totalCharge=${pricing.totalChargeCents} coverPlatformFee=${pricing.coversPlatformFee}`,
    );

    const tipCents = pricing.tipCents;
    const coverPlatformFee = pricing.coversPlatformFee;
    const chargeAmountCents = pricing.totalChargeCents;
    const estimatedStripeFeeCents = pricing.stripeFeeCents;
    const platformFeeCents = pricing.platformFeeCents;
    const applicationFeeAmount = platformFeeCents + pricing.tipCents;

    const paymentIntentRequest = {
      kind: "donation" as const,
      amountCents: chargeAmountCents,
      currency,
      memorialId,
      fundraisingId: program.id,
      connectAccountId: program.connectAccountId || undefined,
      feePlanId: program.feePlanId || undefined,
      applicationFeeAmount,
      metadata: {
        afterlifeMemorialId: memorialId,
        afterlifeFundraisingId: program.id,
        donorDisplay,
        donorEmail: dto.donorEmail,
        message: dto.message,
        tipCents: tipCents.toString(),
        coverPlatformFee: coverPlatformFee ? "yes" : "no",
        estimatedStripeFeeCents: estimatedStripeFeeCents.toString(),
        platformFeeCents: platformFeeCents.toString(),
        netBeneficiaryCents: pricing.netBeneficiaryCents.toString(),
      },
      customerEmail: dto.donorEmail,
      tipAmount: tipCents,
      coverPlatformFee,
    };

    this.logger.debug(
      `Calling billing PI create: amount=${paymentIntentRequest.amountCents} applicationFee=${paymentIntentRequest.applicationFeeAmount} tip=${paymentIntentRequest.tipAmount} coverPlatformFee=${paymentIntentRequest.coverPlatformFee} fundraisingId=${program.id} connect=${paymentIntentRequest.connectAccountId}`,
    );

    const response = await this.billingClient
      .createPaymentIntent(paymentIntentRequest, idempotencyKey)
      .catch((error) => {
        this.logger.error(
          `Billing PI create failed: ${error?.message ?? error}`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error;
      });

    this.logger.debug("Donation payment intent created", {
      memorialId,
      amountCents: dto.amountCents,
      paymentIntentId: response.paymentIntentId,
    });

    return response;
  }

  private extractIp(req?: Request): string | undefined {
    const xfwd =
      req?.headers?.["x-forwarded-for"] || req?.headers?.["X-Forwarded-For"];
    if (typeof xfwd === "string" && xfwd.length > 0) {
      return xfwd.split(",").map((p: string) => p.trim())[0];
    }
    return req?.ip || req?.connection?.remoteAddress;
  }

  async startBeneficiaryOnboarding(
    memorialId: string,
    dto: StartBeneficiaryOnboardingDto,
    userId: string,
    req?: Request,
  ): Promise<{ onboardingUrl: string; beneficiaryOnboardingStatus: string }> {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    const businessWebsite = this.configService.get<string>(
      "STRIPE_BUSINESS_WEBSITE",
    );
    const statementDescriptor = this.configService.get<string>(
      "STRIPE_FULL_STATEMENT_DESCRIPTOR",
    );
    const defaultBusinessName = this.configService.get<string>(
      "STRIPE_BUSINESS_NAME",
    );
    const ip = this.extractIp(req);
    const tosDate = dto.tosDate || Math.floor(Date.now() / 1000);

    const onboardingRequest = {
      memorialId,
      fundraisingId: program.id,
      beneficiaryType: dto.beneficiaryType,
      beneficiaryName: dto.beneficiaryName,
      email: dto.email,
      phone: dto.phone,
      ssnLast4: dto.ssnLast4,
      dobDay: dto.dobDay,
      dobMonth: dto.dobMonth,
      dobYear: dto.dobYear,
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2,
      city: dto.city,
      state: dto.state,
      postalCode: dto.postalCode,
      country: dto.country,
      businessName: dto.beneficiaryName || defaultBusinessName,
      businessWebsite,
      statementDescriptor,
      tosDate,
      tosIp: ip,
      metadata: {
        afterlifeMemorialId: memorialId,
        afterlifeFundraisingId: program.id,
      },
    };

    const response =
      await this.billingClient.startBeneficiaryOnboarding(onboardingRequest);

    // Create Stripe Customer for payout bank account setup on the PLATFORM account
    let stripeCustomerId = program.stripeCustomerId;
    if (!stripeCustomerId) {
      try {
        const customerResponse = await this.billingClient.createCustomer({
          email: dto.email,
          name: dto.beneficiaryName,
          metadata: {
            memorialId,
            fundraisingId: program.id,
            connectAccountId: response.connectAccountId,
          },
          // IMPORTANT: Create on platform account so SetupIntent with on_behalf_of is accessible via platform key
        });
        stripeCustomerId = customerResponse.customerId;
        this.logger.log(
          "Created Stripe customer for payout setup on platform account",
          {
            memorialId,
            customerId: stripeCustomerId,
            connectAccountId: response.connectAccountId,
          },
        );
      } catch (error) {
        this.logger.error(
          "Failed to create Stripe customer - payout bank setup will not be available",
          {
            memorialId,
            connectAccountId: response.connectAccountId,
            error: (error as Error).message,
            stack: (error as Error).stack,
          },
        );
        throw new Error(
          `Failed to create Stripe customer for payout setup: ${(error as Error).message}`,
        );
      }
    }

    // Update program with onboarding information
    await this.prisma.fundraisingProgram.update({
      where: { memorialId },
      data: {
        beneficiaryType: dto.beneficiaryType,
        beneficiaryName: dto.beneficiaryName,
        beneficiaryExternalId: response.beneficiaryId,
        connectAccountId: response.connectAccountId,
        stripeCustomerId,
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
      stripeCustomerId: program.stripeCustomerId,
    };
  }

  async createPayoutSetupIntent(
    memorialId: string,
    customerId: string,
    userId: string,
  ) {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    if (!program.connectAccountId) {
      throw new BadRequestException(
        "Connect account must be created before setting up payout bank",
      );
    }

    // Use provided customerId or fall back to stored one
    const effectiveCustomerId = customerId || program.stripeCustomerId;
    if (!effectiveCustomerId) {
      throw new BadRequestException(
        "Customer ID is required for payout setup. Please complete beneficiary onboarding first.",
      );
    }

    this.logger.debug("Creating payout setup intent", {
      memorialId,
      connectAccountId: program.connectAccountId,
      customerId: effectiveCustomerId,
    });

    try {
      return await this.billingClient.createPayoutSetupIntent({
        connectAccountId: program.connectAccountId,
        customerId: effectiveCustomerId,
      });
    } catch (error) {
      const errorMessage =
        error instanceof HttpException
          ? error.message
          : (error as Error).message;
      const customerMissingOnPlatform = errorMessage?.includes(
        "does not exist on platform",
      );

      // If the stored customer was created on a connected account, recreate on platform and retry once
      if (customerMissingOnPlatform) {
        const fallbackName =
          program.beneficiaryName ||
          program.memorial?.displayName ||
          "Beneficiary";

        this.logger.warn("Platform customer missing; recreating on platform", {
          memorialId,
          connectAccountId: program.connectAccountId,
          previousCustomerId: effectiveCustomerId,
          fallbackName,
        });

        const newCustomer = await this.billingClient.createCustomer({
          name: fallbackName,
          metadata: {
            memorialId,
            fundraisingId: program.id,
            connectAccountId: program.connectAccountId,
            note: "Auto-created on platform for payout bank setup",
          },
        });

        await this.prisma.fundraisingProgram.update({
          where: { memorialId },
          data: { stripeCustomerId: newCustomer.customerId },
        });

        this.logger.log("Retrying payout setup intent with platform customer", {
          memorialId,
          connectAccountId: program.connectAccountId,
          customerId: newCustomer.customerId,
        });

        return this.billingClient.createPayoutSetupIntent({
          connectAccountId: program.connectAccountId,
          customerId: newCustomer.customerId,
        });
      }

      throw error;
    }
  }

  async attachFinancialConnection(
    memorialId: string,
    paymentMethodId: string,
    customerId: string,
    userId: string,
  ) {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    if (!program.connectAccountId) {
      throw new BadRequestException(
        "Connect account must be created before attaching bank",
      );
    }

    // Use provided customerId or fall back to stored one
    const effectiveCustomerId = customerId || program.stripeCustomerId;
    if (!effectiveCustomerId) {
      throw new BadRequestException(
        "Customer ID is required to attach bank. Please complete beneficiary onboarding first.",
      );
    }

    this.logger.debug("Attaching payout bank", {
      memorialId,
      connectAccountId: program.connectAccountId,
      paymentMethodId,
      customerId: effectiveCustomerId,
    });

    const response = await this.billingClient.attachFinancialConnection({
      connectAccountId: program.connectAccountId,
      paymentMethodId,
      customerId: effectiveCustomerId,
    });

    await this.upsertPayoutMethod(program, {
      customerId: effectiveCustomerId,
      paymentMethodId,
    });

    return response;
  }

  async deleteBeneficiary(memorialId: string, userId: string) {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    if (!program.connectAccountId) {
      throw new BadRequestException("No connected account to delete");
    }

    await this.billingClient.deleteBeneficiary(program.connectAccountId);

    await this.prisma.fundraisingProgram.update({
      where: { memorialId },
      data: {
        connectAccountId: null,
        beneficiaryExternalId: null,
        beneficiaryOnboardingStatus: "NOT_STARTED",
      },
    });

    await this.auditService.record({
      subjectType: "FundraisingProgram",
      subjectId: program.id,
      actorUserId: userId,
      action: "BENEFICIARY_DELETED",
      payload: { memorialId },
    });

    return { deleted: true };
  }

  async createFinancialConnectionsSession(
    memorialId: string,
    dto: StartFinancialConnectionsSessionDto,
    userId: string,
  ) {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    if (!program.connectAccountId) {
      throw new BadRequestException(
        "No connected account to link bank account",
      );
    }

    const returnUrl =
      dto.returnUrl ||
      this.configService.get<string>("SERVICE_PUBLIC_BASE_URL");

    return this.billingClient.createFinancialConnectionsSession({
      connectAccountId: program.connectAccountId,
      returnUrl,
    });
  }

  async getFinancialConnectionsSession(
    memorialId: string,
    sessionId: string,
    userId: string,
  ) {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    if (!program.connectAccountId) {
      throw new BadRequestException("No connected account to retrieve session");
    }

    return this.billingClient.getFinancialConnectionsSession({
      connectAccountId: program.connectAccountId,
      sessionId,
    });
  }

  async getPayoutBalance(memorialId: string, userId: string) {
    const program = await this.prisma.fundraisingProgram.findUnique({
      where: { memorialId },
      include: { memorial: true },
    });

    if (!program) {
      throw new NotFoundException("Fundraising program not found");
    }

    assertMemorialOwnerOrAdmin(userId, program.memorial);

    if (!program.connectAccountId) {
      throw new BadRequestException(
        "Connect account must be created before retrieving balance",
      );
    }

    const balance = await this.billingClient.getPayoutBalance(
      program.connectAccountId,
    );

    return {
      memorialId,
      fundraisingId: program.id,
      connectAccountId: program.connectAccountId,
      currency: program.currency,
      livemode: balance?.livemode ?? false,
      available: balance?.available ?? {},
      pending: balance?.pending ?? {},
      instantAvailable: balance?.instantAvailable,
      retrievedAt: balance?.retrievedAt,
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
    const currency = (dto.currency || "USD").toUpperCase();

    assertPositiveCents(dto.amountCents);
    validateCurrency(currency);

    if (currency !== program.currency) {
      throw new BadRequestException(
        `Currency mismatch. Program uses ${program.currency}, but got ${dto.currency}`,
      );
    }

    const mode: "STANDARD" | "INSTANT" =
      dto.mode && dto.mode.toUpperCase() === "INSTANT" ? "INSTANT" : "STANDARD";

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
      currency,
      connectAccountId: program.connectAccountId,
      mode,
      metadata: {
        afterlifeMemorialId: memorialId,
        afterlifeFundraisingId: program.id,
      },
      note: dto.note || "",
    };

    const response = await this.billingClient.requestPayout(payoutRequest);

    // Create payout mirror; handle duplicate payoutId gracefully (idempotent retries)
    let payoutMirror: PayoutMirror | null = null;
    try {
      payoutMirror = await this.prisma.payoutMirror.create({
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
    } catch (error) {
      if ((error as any)?.code === "P2002") {
        payoutMirror = await this.prisma.payoutMirror.findUnique({
          where: { billingPayoutId: response.payoutId },
        });
      } else {
        throw error;
      }
    }

    if (!payoutMirror) {
      throw new Error("Failed to persist payout mirror");
    }

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

  private toPayoutMethodDto(
    payoutMethod: PayoutMethod | null,
  ): PayoutMethodDto | null {
    if (!payoutMethod) {
      return null;
    }

    return {
      hasBankAccount: !!payoutMethod.hasBankAccount,
      bankLast4: payoutMethod.bankLast4 || null,
      bankName: payoutMethod.bankName || null,
      bankCountry: payoutMethod.bankCountry || null,
      bankCurrency: payoutMethod.bankCurrency || null,
      institutionName: payoutMethod.institutionName || null,
      payoutsEnabled: !!payoutMethod.payoutsEnabled,
      accountStatus: payoutMethod.accountStatus || null,
    };
  }

  private async upsertPayoutMethod(
    program: FundraisingProgram,
    context: { customerId?: string; paymentMethodId?: string },
  ): Promise<void> {
    if (!program.connectAccountId) {
      return;
    }

    try {
      const bankInfo = await this.billingClient.getPayoutBankInfo(
        program.connectAccountId,
      );

      await this.prisma.payoutMethod.upsert({
        where: { fundraisingId: program.id },
        create: {
          fundraisingId: program.id,
          connectAccountId: program.connectAccountId,
          customerId: context.customerId,
          paymentMethodId: context.paymentMethodId,
          hasBankAccount: bankInfo.hasBankAccount,
          bankLast4: bankInfo.bankLast4,
          bankName: bankInfo.bankName,
          bankCountry: bankInfo.bankCountry,
          bankCurrency: bankInfo.bankCurrency,
          institutionName: bankInfo.institutionName,
          payoutsEnabled: bankInfo.payoutsEnabled,
          accountStatus: bankInfo.accountStatus,
        },
        update: {
          connectAccountId: program.connectAccountId,
          customerId: context.customerId ?? undefined,
          paymentMethodId: context.paymentMethodId ?? undefined,
          hasBankAccount: bankInfo.hasBankAccount,
          bankLast4: bankInfo.bankLast4,
          bankName: bankInfo.bankName,
          bankCountry: bankInfo.bankCountry,
          bankCurrency: bankInfo.bankCurrency,
          institutionName: bankInfo.institutionName,
          payoutsEnabled: bankInfo.payoutsEnabled,
          accountStatus: bankInfo.accountStatus,
        },
      });

      this.logger.debug("Stored payout method for fundraising program", {
        memorialId: program.memorialId,
        fundraisingId: program.id,
        connectAccountId: program.connectAccountId,
      });
    } catch (error) {
      this.logger.error("Failed to store payout method", {
        memorialId: program.memorialId,
        fundraisingId: program.id,
        connectAccountId: program.connectAccountId,
        error: (error as Error).message,
      });
    }
  }
}
