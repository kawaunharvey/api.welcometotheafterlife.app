import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsArray,
  IsBoolean,
  Matches,
  Length,
} from "class-validator";
import { Transform } from "class-transformer";

export class CreateVerificationCaseDto {
  @IsString()
  memorialId: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  dateOfPassing?: string;

  @IsOptional()
  @Matches(/^\d{9}$/, { message: "SSN must be exactly 9 digits" })
  @Transform(({ value }) => value?.replace(/\D/g, ""))
  ssn?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  deathCertificateId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  certificateNumber?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @IsOptional()
  @IsString()
  county?: string;
}

export class UpdateVerificationCaseInputsDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsDateString()
  dateOfPassing?: string;

  @IsOptional()
  @Matches(/^\d{9}$/, { message: "SSN must be exactly 9 digits" })
  @Transform(({ value }) => value?.replace(/\D/g, ""))
  ssn?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  deathCertificateId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  certificateNumber?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @IsOptional()
  @IsString()
  county?: string;
}

export class RunDmfCheckDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean = false;
}

export enum ManualReviewDecision {
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export class CreateManualReviewDto {
  @IsEnum(ManualReviewDecision)
  decision: ManualReviewDecision;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reasonCodes?: string[];
}

export class VerificationCaseResponseDto {
  id: string;
  memorialId: string;
  submittedBy: string;
  inputs: {
    fullName: string;
    dateOfBirth?: string;
    dateOfPassing?: string;
    ssnLast4?: string;
    certificateNumber?: string;
    state?: string;
    county?: string;
    deathCertificateId?: string;
  };
  comparison?: {
    nameMatchScore?: number;
    dobMatchScore?: number;
    dopMatchScore?: number;
    certificateNumberMatch?: number;
    overallScore?: number;
    notes?: string;
  };
  status: string;
  reasonCodes: string[];
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;

  // Safe security info (never expose actual encrypted/hashed data)
  securityInfo?: {
    hasEncryptedSsn: boolean;
    hasHashedSsn: boolean;
    hasHashedCertId: boolean;
    lastUsedAt?: string;
  };

  documents: {
    id: string;
    kind: string;
    uploadedAt: string;
    ocrText?: string;
    matchScore?: number;
    verifiedFields: string[];
  }[];

  providerChecks: {
    id: string;
    provider: string;
    requestId?: string;
    matchScore?: number;
    result?: string;
    createdAt: string;
  }[];

  manualReviews: {
    id: string;
    reviewerUserId: string;
    notes?: string;
    decision: string;
    createdAt: string;
    decidedAt?: string;
  }[];
}

export class VerificationSummaryDto {
  status: string;
  verifiedFields: string[];
  lastCheckedAt?: string;
  hasVerifiedDeathCertificate: boolean;
}

// Webhook DTOs
export class DmfWebhookDto {
  event?: string;
  submission_id?: number;
  source?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  request_data?: {
    ssn?: string;
    firstname?: string;
    lastname?: string;
    dateofbirth?: string;
    dateofdeath?: string;
    yearofbirth?: string;
    yearofdeath?: string;
  };
  results?: Array<{
    id?: number;
    ssn?: string;
    fullname?: string;
    dateofbirth?: string;
    dateofdeath?: string;
  }>;
  metadata?: {
    afterlifeVerificationId?: string;
    afterlifeMemorialId?: string;
  };
}
