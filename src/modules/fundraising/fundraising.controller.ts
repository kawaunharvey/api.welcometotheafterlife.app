import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Headers,
  Req,
  Logger,
} from "@nestjs/common";
import { FundraisingService } from "./fundraising.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  CreateFundraisingProgramDto,
  UpdateFundraisingProgramDto,
  CreateDonationCheckoutDto,
  CreateDonationPaymentIntentDto,
  StartBeneficiaryOnboardingDto,
  StartFinancialConnectionsSessionDto,
  RequestPayoutDto,
  FundraisingProgramSummaryDto,
  DonationListItemDto,
  PayoutListItemDto,
  BeneficiaryStatusDto,
} from "./dto/fundraising.dto";
import { FundraisingProgram } from "@prisma/client";
import { Request } from "express";

interface User {
  userId: string;
  email: string;
}

@Controller("fundraising")
@UseGuards(JwtAuthGuard)
export class FundraisingController {
  private readonly logger = new Logger(FundraisingController.name);

  constructor(private readonly fundraisingService: FundraisingService) {}

  @Post("programs")
  async createProgram(
    @Body() dto: CreateFundraisingProgramDto,
    @CurrentUser() user: User,
  ): Promise<FundraisingProgram> {
    this.logger.debug("Creating fundraising program", {
      memorialId: dto.memorialId,
      userId: user.userId,
    });

    return this.fundraisingService.createProgram(dto, user.userId);
  }

  @Get("programs/:memorialId")
  async getProgram(
    @Param("memorialId") memorialId: string,
  ): Promise<FundraisingProgram | null> {
    this.logger.debug("Getting fundraising program", { memorialId });

    return this.fundraisingService.getProgramByMemorial(memorialId);
  }

  @Patch("programs/:memorialId")
  async updateProgram(
    @Param("memorialId") memorialId: string,
    @Body() dto: UpdateFundraisingProgramDto,
    @CurrentUser() user: User,
  ): Promise<FundraisingProgram> {
    this.logger.debug("Updating fundraising program", {
      memorialId,
      userId: user.userId,
    });

    return this.fundraisingService.updateProgram(memorialId, dto, user.userId);
  }

  @Get("programs/:memorialId/summary")
  async getSummary(
    @Param("memorialId") memorialId: string,
  ): Promise<FundraisingProgramSummaryDto> {
    this.logger.debug("Getting fundraising summary", { memorialId });

    return this.fundraisingService.computeSummary(memorialId);
  }

  @Get("programs/:memorialId/donations")
  async listDonations(
    @Param("memorialId") memorialId: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ): Promise<DonationListItemDto[]> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 20;

    this.logger.debug("Listing donations", {
      memorialId,
      limit: parsedLimit,
      cursor,
    });

    return this.fundraisingService.listDonations(
      memorialId,
      parsedLimit,
      cursor,
    );
  }

  @Post("programs/:memorialId/checkout")
  async createCheckout(
    @Param("memorialId") memorialId: string,
    @Body() dto: CreateDonationCheckoutDto,
    @CurrentUser() user: User,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<{ checkoutUrl: string; paymentId: string }> {
    this.logger.debug("Creating donation checkout", {
      memorialId,
      amountCents: dto.amountCents,
      userId: user.userId,
    });

    return this.fundraisingService.createCheckout(
      memorialId,
      dto,
      user.userId,
      idempotencyKey,
    );
  }

  @Post("programs/:memorialId/payment-intent")
  async createPaymentIntent(
    @Param("memorialId") memorialId: string,
    @Body() dto: CreateDonationPaymentIntentDto,
    @CurrentUser() user: User,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    publishableKey: string;
    ephemeralKey?: string;
  }> {
    this.logger.debug("Creating donation payment intent", {
      memorialId,
      amountCents: dto.amountCents,
      userId: user.userId,
    });

    return this.fundraisingService.createPaymentIntent(
      memorialId,
      dto,
      user.userId,
      idempotencyKey,
    );
  }

  @Post("programs/:memorialId/beneficiary/start-onboarding")
  async startBeneficiaryOnboarding(
    @Param("memorialId") memorialId: string,
    @Body() dto: StartBeneficiaryOnboardingDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<{ onboardingUrl: string; beneficiaryOnboardingStatus: string }> {
    this.logger.debug("Starting beneficiary onboarding", {
      memorialId,
      beneficiaryType: dto.beneficiaryType,
      userId: user.userId,
    });

    return this.fundraisingService.startBeneficiaryOnboarding(
      memorialId,
      dto,
      user.userId,
      req,
    );
  }

  @Get("programs/:memorialId/beneficiary")
  async getBeneficiaryStatus(
    @Param("memorialId") memorialId: string,
  ): Promise<BeneficiaryStatusDto> {
    this.logger.debug("Getting beneficiary status", { memorialId });

    return this.fundraisingService.getBeneficiaryStatus(memorialId);
  }

  @Delete("programs/:memorialId/beneficiary")
  async deleteBeneficiary(
    @Param("memorialId") memorialId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.debug("Deleting beneficiary", {
      memorialId,
      userId: user.userId,
    });

    return this.fundraisingService.deleteBeneficiary(memorialId, user.userId);
  }

  @Post("programs/:memorialId/beneficiary/financial-connections/session")
  async createFinancialConnectionsSession(
    @Param("memorialId") memorialId: string,
    @Body() dto: StartFinancialConnectionsSessionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.debug("Creating financial connections session", {
      memorialId,
      userId: user.userId,
    });

    return this.fundraisingService.createFinancialConnectionsSession(
      memorialId,
      dto,
      user.userId,
    );
  }

  @Post(
    "programs/:memorialId/beneficiary/financial-connections/session/:sessionId/retrieve",
  )
  async getFinancialConnectionsSession(
    @Param("memorialId") memorialId: string,
    @Param("sessionId") sessionId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.debug("Retrieving financial connections session", {
      memorialId,
      sessionId,
      userId: user.userId,
    });

    return this.fundraisingService.getFinancialConnectionsSession(
      memorialId,
      sessionId,
      user.userId,
    );
  }

  @Post("programs/:memorialId/beneficiary/payout-bank/setup-intent")
  async createPayoutSetupIntent(
    @Param("memorialId") memorialId: string,
    @Body() dto: { customerId: string },
    @CurrentUser() user: User,
  ) {
    this.logger.debug("Creating payout setup intent", {
      memorialId,
      customerId: dto.customerId,
      userId: user.userId,
    });

    return this.fundraisingService.createPayoutSetupIntent(
      memorialId,
      dto.customerId,
      user.userId,
    );
  }

  @Post("programs/:memorialId/beneficiary/financial-connections/attach")
  @Post("programs/:memorialId/beneficiary/payout-bank/attach")
  async attachPayoutBank(
    @Param("memorialId") memorialId: string,
    @Body() dto: { paymentMethodId: string; customerId: string },
    @CurrentUser() user: User,
  ) {
    this.logger.debug("Attaching payout bank", {
      memorialId,
      paymentMethodId: dto.paymentMethodId,
      customerId: dto.customerId,
      userId: user.userId,
    });

    return this.fundraisingService.attachFinancialConnection(
      memorialId,
      dto.paymentMethodId,
      dto.customerId,
      user.userId,
    );
  }

  @Post("programs/:memorialId/payouts")
  async requestPayout(
    @Param("memorialId") memorialId: string,
    @Body() dto: RequestPayoutDto,
    @CurrentUser() user: User,
  ): Promise<PayoutListItemDto> {
    this.logger.debug("Requesting payout", {
      memorialId,
      amountCents: dto.amountCents,
      userId: user.userId,
    });

    return this.fundraisingService.requestPayout(memorialId, dto, user.userId);
  }

  @Get("programs/:memorialId/payouts")
  async listPayouts(
    @Param("memorialId") memorialId: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ): Promise<PayoutListItemDto[]> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 20;

    this.logger.debug("Listing payouts", {
      memorialId,
      limit: parsedLimit,
      cursor,
    });

    return this.fundraisingService.listPayouts(memorialId, parsedLimit, cursor);
  }
}
