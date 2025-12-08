import { IsString, IsInt, IsOptional, Min, IsIn, IsUrl } from "class-validator";
import { Type } from "class-transformer";

export class CreateFundraisingProgramDto {
  @IsString()
  memorialId: string;

  @IsString()
  purpose: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  goalAmountCents?: number;

  @IsOptional()
  @IsString()
  @IsIn(["USD"])
  currency?: string = "USD";

  @IsOptional()
  @IsString()
  @IsIn(["INDIVIDUAL", "FAMILY", "CHARITY", "OTHER"])
  beneficiaryType?: string;

  @IsOptional()
  @IsString()
  beneficiaryName?: string;

  @IsOptional()
  @IsString()
  feePlanId?: string;
}

export class UpdateFundraisingProgramDto {
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  goalAmountCents?: number;

  @IsOptional()
  @IsString()
  @IsIn(["ACTIVE", "PAUSED", "CLOSED"])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(["INDIVIDUAL", "FAMILY", "CHARITY", "OTHER"])
  beneficiaryType?: string;

  @IsOptional()
  @IsString()
  beneficiaryName?: string;

  @IsOptional()
  @IsString()
  feePlanId?: string;
}

export class CreateDonationCheckoutDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amountCents: number;

  @IsOptional()
  @IsString()
  @IsIn(["USD"])
  currency?: string = "USD";

  @IsOptional()
  @IsString()
  donorDisplay?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsUrl()
  returnUrl?: string;

  @IsOptional()
  @IsUrl()
  cancelUrl?: string;
}

export class CreateDonationPaymentIntentDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amountCents: number;

  @IsOptional()
  @IsString()
  @IsIn(["USD"])
  currency?: string = "USD";

  @IsOptional()
  @IsString()
  donorDisplay?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class StartBeneficiaryOnboardingDto {
  @IsString()
  @IsIn(["INDIVIDUAL", "FAMILY", "CHARITY", "OTHER"])
  beneficiaryType: string;

  @IsString()
  beneficiaryName: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  ssnLast4?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  dobDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  dobMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Type(() => Number)
  dobYear?: number;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  tosDate?: number;
}

export class StartFinancialConnectionsSessionDto {
  @IsOptional()
  @IsUrl()
  returnUrl?: string;
}

export class RequestPayoutDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amountCents: number;

  @IsOptional()
  @IsString()
  @IsIn(["USD"])
  currency?: string = "USD";

  @IsOptional()
  @IsString()
  note?: string;
}

export interface FundraisingProgramSummaryDto {
  memorialId: string;
  status: string;
  goalAmountCents: number | null;
  currentAmountCents: number;
  totalPayoutsCents: number;
  availableForPayoutCents: number;
  currency: string;
  donationCount: number;
  lastDonationAt: string | null;
  beneficiaryOnboardingStatus: string;
}

export interface DonationListItemDto {
  donorDisplay: string;
  message: string | null;
  amountCents: number;
  currency: string;
  madeAt: string;
}

export interface PayoutListItemDto {
  billingPayoutId: string;
  amountCents: number;
  currency: string;
  status: string;
  initiatedAt: string;
  completedAt: string | null;
  destinationSummary: string | null;
  failureReason: string | null;
}

export interface BeneficiaryStatusDto {
  beneficiaryType: string | null;
  beneficiaryName: string | null;
  beneficiaryOnboardingStatus: string;
  connectAccountId: string | null;
  stripeCustomerId: string | null;
}
