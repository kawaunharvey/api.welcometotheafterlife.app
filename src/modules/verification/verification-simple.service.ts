import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SensitiveDataService } from "./sensitive-data.service";
import { DmfService } from "./dmf.service";
import {
  CreateVerificationCaseDto,
  UpdateVerificationCaseInputsDto,
  VerificationCaseResponseDto,
  VerificationSummaryDto,
  RunDmfCheckDto,
  CreateManualReviewDto,
} from "./verification.dto";
import { VerificationStatus, ReviewDecision } from "@prisma/client";

interface EncryptedSsnData {
  encFullSsn?: string;
  encSsnIv?: string;
  encSsnAuthTag?: string;
  hashedSsn?: string;
  lastUsedAt?: Date;
}

interface SecretsUpdateData {
  encFullSsn?: string | null;
  encSsnIv?: string | null;
  encSsnAuthTag?: string | null;
  hashedSsn?: string | null;
  hashedCertId?: string | null;
  lastUsedAt?: Date;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private prisma: PrismaService,
    private sensitiveDataService: SensitiveDataService,
    private dmfService: DmfService,
  ) {}

  /**
   * Create or update a verification case
   */
  async createOrUpdateCase(
    dto: CreateVerificationCaseDto,
    userId: string,
  ): Promise<VerificationCaseResponseDto> {
    // Check if memorial exists and user has access
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: dto.memorialId },
    });

    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    if (memorial.ownerUserId !== userId) {
      throw new ForbiddenException("Access denied to this memorial");
    }

    // Check if verification case already exists
    const existingCase = await this.prisma.verificationCase.findUnique({
      where: { memorialId: dto.memorialId },
      include: {
        documents: true,
        providerChecks: true,
        manualReviews: true,
      },
    });

    // Prepare verification inputs
    let ssnLast4: string | undefined;
    let hashedSsn: string | undefined;
    let hashedCertId: string | undefined;
    const encryptedSsnData: EncryptedSsnData = {};

    // Process SSN if provided
    if (dto.ssn) {
      const cleanSsn = this.sensitiveDataService.cleanSsn(dto.ssn);
      const extractedLast4 =
        this.sensitiveDataService.extractSsnLast4(cleanSsn);
      ssnLast4 = extractedLast4 ?? undefined;
      hashedSsn = await this.sensitiveDataService.hashSensitiveData(cleanSsn);

      // Encrypt full SSN temporarily
      const encrypted =
        this.sensitiveDataService.encryptSensitiveData(cleanSsn);
      encryptedSsnData.encFullSsn = encrypted.encValue;
      encryptedSsnData.encSsnIv = encrypted.encIv;
      encryptedSsnData.encSsnAuthTag = encrypted.encAuthTag;
      encryptedSsnData.hashedSsn = hashedSsn;
      encryptedSsnData.lastUsedAt = new Date();
    }

    // Process death certificate ID if provided
    if (dto.deathCertificateId) {
      hashedCertId = await this.sensitiveDataService.hashSensitiveData(
        dto.deathCertificateId,
      );
    }

    const inputsData = {
      fullName: dto.fullName,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      dateOfPassing: dto.dateOfPassing
        ? new Date(dto.dateOfPassing)
        : undefined,
      ssnLast4,
      certificateNumber: dto.certificateNumber,
      state: dto.state,
      county: dto.county,
      deathCertificateId: dto.deathCertificateId, // Store temporarily for comparison, will be cleared later
    };

    if (existingCase) {
      // Update existing case
      const verificationCase = await this.prisma.verificationCase.update({
        where: { id: existingCase.id },
        data: {
          inputs: inputsData,
          updatedAt: new Date(),
          // Reset comparison if inputs changed significantly
          comparison: undefined,
        },
        include: {
          documents: true,
          providerChecks: true,
          manualReviews: true,
        },
      });

      this.logger.log("Verification case updated", {
        caseId: verificationCase.id,
        memorialId: dto.memorialId,
      });

      return this.mapToResponseDto(verificationCase);
    } else {
      // Create new case
      const verificationCase = await this.prisma.verificationCase.create({
        data: {
          memorialId: dto.memorialId,
          submittedBy: userId,
          inputs: inputsData,
          status: VerificationStatus.PENDING,
          reasonCodes: [],
        },
        include: {
          documents: true,
          providerChecks: true,
          manualReviews: true,
        },
      });

      // Update memorial verification status
      await this.prisma.memorial.update({
        where: { id: dto.memorialId },
        data: { verificationStatus: VerificationStatus.PENDING },
      });

      this.logger.log("Verification case created", {
        caseId: verificationCase.id,
        memorialId: dto.memorialId,
      });

      return this.mapToResponseDto(verificationCase);
    }
  }

  /**
   * Get verification case by ID
   */
  async getCaseById(
    caseId: string,
    userId: string,
  ): Promise<VerificationCaseResponseDto> {
    const verificationCase = await this.prisma.verificationCase.findUnique({
      where: { id: caseId },
      include: {
        memorial: true,
        documents: true,
        providerChecks: true,
        manualReviews: true,
      },
    });

    if (!verificationCase) {
      throw new NotFoundException("Verification case not found");
    }

    // Check access permissions
    if (verificationCase.memorial.ownerUserId !== userId) {
      // TODO: Add check for internal reviewer role
      throw new ForbiddenException("Access denied to this verification case");
    }

    return this.mapToResponseDto(verificationCase);
  }

  /**
   * Update verification case inputs - simplified version
   */
  async updateCaseInputs(
    caseId: string,
    dto: UpdateVerificationCaseInputsDto,
    userId: string,
  ): Promise<VerificationCaseResponseDto> {
    const existingCase = await this.prisma.verificationCase.findUnique({
      where: { id: caseId },
      include: {
        memorial: true,
      },
    });

    if (!existingCase) {
      throw new NotFoundException("Verification case not found");
    }

    if (existingCase.memorial.ownerUserId !== userId) {
      throw new ForbiddenException("Access denied to this verification case");
    }

    // Simple update for now - just merge with existing inputs
    const existingInputs = existingCase.inputs as Record<string, unknown>;

    const updatedInputs = {
      fullName: (dto.fullName ?? existingInputs.fullName) as string,
      dateOfBirth: dto.dateOfBirth
        ? new Date(dto.dateOfBirth)
        : (existingInputs.dateOfBirth as Date | undefined),
      dateOfPassing: dto.dateOfPassing
        ? new Date(dto.dateOfPassing)
        : (existingInputs.dateOfPassing as Date | undefined),
      ssnLast4: existingInputs.ssnLast4 as string | undefined,
      certificateNumber: (dto.certificateNumber ??
        existingInputs.certificateNumber) as string | undefined,
      state: (dto.state ?? existingInputs.state) as string | undefined,
      county: (dto.county ?? existingInputs.county) as string | undefined,
      deathCertificateId: existingInputs.deathCertificateId as
        | string
        | undefined,
    };

    // Update the case
    const updatedCase = await this.prisma.verificationCase.update({
      where: { id: caseId },
      data: {
        inputs: updatedInputs,
        updatedAt: new Date(),
      },
      include: {
        documents: true,
        providerChecks: true,
        manualReviews: true,
      },
    });

    this.logger.log("Verification case inputs updated", { caseId });

    return this.mapToResponseDto(updatedCase);
  }

  /**
   * Get memorial verification summary (public-safe)
   */
  async getMemorialVerificationSummary(
    memorialId: string,
  ): Promise<VerificationSummaryDto> {
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
      include: {
        verificationCase: {
          include: {
            documents: true,
            providerChecks: true,
            manualReviews: true,
          },
        },
      },
    });

    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    let verifiedFields: string[] = [];
    let lastCheckedAt: Date | null = null;
    let hasVerifiedDeathCertificate = false;

    if (memorial.verificationCase) {
      const documents = memorial.verificationCase.documents;
      const providerChecks = memorial.verificationCase.providerChecks;

      // Aggregate verified fields from documents
      for (const doc of documents) {
        verifiedFields.push(...doc.verifiedFields);
        if (doc.kind === "death_certificate" && doc.verifiedFields.length > 0) {
          hasVerifiedDeathCertificate = true;
        }
      }

      // Check for recent provider checks
      if (providerChecks.length > 0) {
        const latestCheck = providerChecks.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        )[0];
        lastCheckedAt = latestCheck.createdAt;
      }

      // Remove duplicates
      verifiedFields = [...new Set(verifiedFields)];
    }

    return {
      status: memorial.verificationStatus,
      verifiedFields,
      lastCheckedAt: lastCheckedAt?.toISOString() || undefined,
      hasVerifiedDeathCertificate,
    };
  }

  /**
   * Run DMF check for a verification case
   */
  async runDmfCheck(
    caseId: string,
    dto: RunDmfCheckDto,
    userId: string,
  ): Promise<{ success: boolean; message: string; providerCheckId?: string }> {
    // Get verification case with secrets
    const verificationCase = await this.prisma.verificationCase.findUnique({
      where: { id: caseId },
      include: {
        memorial: true,
        providerChecks: {
          where: { provider: "COMPLIANCELY_DMF" },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!verificationCase) {
      throw new NotFoundException("Verification case not found");
    }

    // Check access permissions
    if (verificationCase.memorial.ownerUserId !== userId) {
      // TODO: Add check for internal reviewer role
      throw new ForbiddenException("Access denied to this verification case");
    }

    // Check if recent DMF check exists and force is not set
    if (!dto.force && verificationCase.providerChecks.length > 0) {
      const recentCheck = verificationCase.providerChecks[0];
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      if (recentCheck.createdAt > oneDayAgo) {
        return {
          success: false,
          message:
            "DMF check was already performed recently. Use force=true to override.",
          providerCheckId: recentCheck.id,
        };
      }
    }

    const inputs = verificationCase.inputs as Record<string, unknown>;

    // Extract required data for DMF search
    const fullName = inputs.fullName as string;
    if (!fullName) {
      return {
        success: false,
        message: "Full name is required for DMF search",
      };
    }

    // Split name into first and last name
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // For this simplified version, we'll simulate DMF without actual SSN decryption
    // In the full implementation, you would decrypt the SSN from VerificationSecret
    const dmfSearchRequest: Record<string, unknown> = {
      firstname: firstName,
      lastname: lastName,
    };

    // Add dates if available
    if (inputs.dateOfBirth) {
      const dob = new Date(inputs.dateOfBirth as string);
      dmfSearchRequest.dateofbirth = this.dmfService.formatDateForDmf(dob);
      dmfSearchRequest.yearofbirth = this.dmfService.formatYearForDmf(dob);
    }

    if (inputs.dateOfPassing) {
      const dop = new Date(inputs.dateOfPassing as string);
      dmfSearchRequest.dateofdeath = this.dmfService.formatDateForDmf(dop);
      dmfSearchRequest.yearofdeath = this.dmfService.formatYearForDmf(dop);
    }

    // Add webhook URL for async results
    dmfSearchRequest.webhook_urls = [
      `${process.env.SERVICE_PUBLIC_BASE_URL}/verification/webhooks/compliancely/dmf`,
    ];

    try {
      // Submit DMF search
      const dmfResponse = await this.dmfService.submitSearch(dmfSearchRequest);

      let result = "INCONCLUSIVE";
      let matchScore: number | null = null;
      let requestId: string | null = null;

      if (!dmfResponse.success) {
        result = "ERROR";
      } else if (dmfResponse.data) {
        requestId = dmfResponse.data.id.toString();

        // Calculate match score if we have results
        if (dmfResponse.data.results && dmfResponse.data.results.length > 0) {
          const bestResult = dmfResponse.data.results[0];
          matchScore = this.dmfService.calculateMatchScore(
            {
              fullName,
              dateOfBirth: inputs.dateOfBirth
                ? new Date(inputs.dateOfBirth as string)
                : undefined,
              dateOfPassing: inputs.dateOfPassing
                ? new Date(inputs.dateOfPassing as string)
                : undefined,
            },
            bestResult,
          );

          result =
            matchScore > 0.7
              ? "MATCH"
              : matchScore > 0.3
                ? "INCONCLUSIVE"
                : "NO_MATCH";
        } else {
          result = "NO_MATCH";
        }
      }

      // Create provider check record
      const providerCheck = await this.prisma.providerCheck.create({
        data: {
          verificationId: caseId,
          provider: "COMPLIANCELY_DMF",
          requestId,
          matchScore,
          result,
          raw: {
            status: dmfResponse.data?.status,
            submissionId: dmfResponse.data?.id,
            resultCount: dmfResponse.data?.results?.length || 0,
          },
        },
      });

      // Update verification case comparison
      await this.updateVerificationComparison(caseId, matchScore);

      this.logger.log("DMF check completed", {
        caseId,
        result,
        matchScore,
        requestId,
      });

      return {
        success: true,
        message: `DMF check completed with result: ${result}`,
        providerCheckId: providerCheck.id,
      };
    } catch (error) {
      this.logger.error("DMF check failed", {
        caseId,
        error: error.message,
      });

      // Create error provider check record
      const providerCheck = await this.prisma.providerCheck.create({
        data: {
          verificationId: caseId,
          provider: "COMPLIANCELY_DMF",
          result: "ERROR",
          raw: {
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        },
      });

      return {
        success: false,
        message: `DMF check failed: ${error.message}`,
        providerCheckId: providerCheck.id,
      };
    }
  }

  /**
   * Submit manual review decision
   */
  async submitManualReview(
    caseId: string,
    dto: CreateManualReviewDto,
    reviewerUserId: string,
  ): Promise<{ success: boolean; message: string; reviewId: string }> {
    // Get verification case
    const verificationCase = await this.prisma.verificationCase.findUnique({
      where: { id: caseId },
      include: {
        memorial: true,
        manualReviews: {
          where: { decision: { not: ReviewDecision.PENDING } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!verificationCase) {
      throw new NotFoundException("Verification case not found");
    }

    // TODO: Add proper role-based authorization for internal reviewers
    // For now, we'll allow any authenticated user to review (not production ready)

    // Check if case is already decided
    const existingDecision = verificationCase.manualReviews.find(
      (review) => review.decision !== ReviewDecision.PENDING,
    );

    if (existingDecision) {
      return {
        success: false,
        message: `Case already decided with ${existingDecision.decision} on ${existingDecision.decidedAt?.toISOString()}`,
        reviewId: existingDecision.id,
      };
    }

    // Convert DTO decision to enum
    const reviewDecision =
      dto.decision === "APPROVED"
        ? ReviewDecision.APPROVED
        : ReviewDecision.REJECTED;

    const verificationStatus =
      dto.decision === "APPROVED"
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

    try {
      // Create manual review record
      const manualReview = await this.prisma.manualReview.create({
        data: {
          verificationId: caseId,
          reviewerUserId,
          notes: dto.notes,
          decision: reviewDecision,
          decidedAt: new Date(),
        },
      });

      // Update verification case status
      await this.prisma.verificationCase.update({
        where: { id: caseId },
        data: {
          status: verificationStatus,
          reasonCodes: dto.reasonCodes || [],
          decidedAt: new Date(),
        },
      });

      // Update memorial verification status
      await this.prisma.memorial.update({
        where: { id: verificationCase.memorialId },
        data: {
          verificationStatus,
        },
      });

      // TODO: In full implementation, clean up sensitive data here
      // For now, we'll just log the action
      if (dto.decision === "APPROVED" || dto.decision === "REJECTED") {
        this.logger.log(
          "Verification case decided - sensitive data should be cleaned up",
          {
            caseId,
            decision: dto.decision,
            reviewerId: reviewerUserId,
          },
        );

        // In the full implementation, you would:
        // 1. Load VerificationSecret
        // 2. Clear encFullSsn, encSsnIv, encSsnAuthTag
        // 3. Keep hashedSsn and hashedCertId for anti-fraud
      }

      this.logger.log("Manual review submitted", {
        caseId,
        decision: dto.decision,
        reviewerId: reviewerUserId,
        reviewId: manualReview.id,
      });

      return {
        success: true,
        message: `Verification case ${dto.decision.toLowerCase()} successfully`,
        reviewId: manualReview.id,
      };
    } catch (error) {
      this.logger.error("Failed to submit manual review", {
        caseId,
        error: error.message,
      });

      throw new Error(`Failed to submit manual review: ${error.message}`);
    }
  }

  /**
   * Update verification comparison scores
   */
  private async updateVerificationComparison(
    caseId: string,
    dmfMatchScore: number | null,
  ): Promise<void> {
    const existingCase = await this.prisma.verificationCase.findUnique({
      where: { id: caseId },
    });

    if (!existingCase) return;

    const existingComparison =
      (existingCase.comparison as Record<string, unknown>) || {};

    // Simple overall score calculation
    let overallScore = 0;
    let scoreCount = 0;

    if (existingComparison.nameMatchScore) {
      overallScore += existingComparison.nameMatchScore as number;
      scoreCount++;
    }

    if (existingComparison.dobMatchScore) {
      overallScore += existingComparison.dobMatchScore as number;
      scoreCount++;
    }

    if (dmfMatchScore !== null) {
      overallScore += dmfMatchScore;
      scoreCount++;
    }

    const finalScore = scoreCount > 0 ? overallScore / scoreCount : 0;

    await this.prisma.verificationCase.update({
      where: { id: caseId },
      data: {
        comparison: {
          ...existingComparison,
          overallScore: finalScore,
          notes: `Updated with DMF match score: ${dmfMatchScore}`,
        },
      },
    });
  }

  /**
   * Map database entity to response DTO (safely excludes sensitive data)
   */
  private mapToResponseDto(verificationCase: any): VerificationCaseResponseDto {
    const inputs = verificationCase.inputs as Record<string, unknown>;

    return {
      id: verificationCase.id,
      memorialId: verificationCase.memorialId,
      submittedBy: verificationCase.submittedBy,
      inputs: {
        fullName: inputs.fullName as string,
        dateOfBirth: inputs.dateOfBirth
          ? new Date(inputs.dateOfBirth as string).toISOString()
          : undefined,
        dateOfPassing: inputs.dateOfPassing
          ? new Date(inputs.dateOfPassing as string).toISOString()
          : undefined,
        ssnLast4: inputs.ssnLast4 as string | undefined,
        certificateNumber: inputs.certificateNumber as string | undefined,
        state: inputs.state as string | undefined,
        county: inputs.county as string | undefined,
        // NEVER expose actual deathCertificateId in API responses
        deathCertificateId: inputs.deathCertificateId ? "***" : undefined,
      },
      comparison: verificationCase.comparison || undefined,
      status: verificationCase.status,
      reasonCodes: verificationCase.reasonCodes,
      decidedAt: verificationCase.decidedAt?.toISOString(),
      createdAt: verificationCase.createdAt.toISOString(),
      updatedAt: verificationCase.updatedAt.toISOString(),
      securityInfo: undefined, // Will add this when we implement VerificationSecret handling
      documents:
        verificationCase.documents?.map((doc: any) => ({
          id: doc.id,
          kind: doc.kind,
          uploadedAt: doc.uploadedAt.toISOString(),
          ocrText: doc.ocrText,
          matchScore: doc.matchScore,
          verifiedFields: doc.verifiedFields,
        })) || [],
      providerChecks:
        verificationCase.providerChecks?.map((check: any) => ({
          id: check.id,
          provider: check.provider,
          requestId: check.requestId,
          matchScore: check.matchScore,
          result: check.result,
          createdAt: check.createdAt.toISOString(),
          // NEVER expose raw check data
        })) || [],
      manualReviews:
        verificationCase.manualReviews?.map((review: any) => ({
          id: review.id,
          reviewerUserId: review.reviewerUserId,
          notes: review.notes,
          decision: review.decision,
          createdAt: review.createdAt.toISOString(),
          decidedAt: review.decidedAt?.toISOString(),
        })) || [],
    };
  }

  /**
   * Find provider check by search ID for webhook processing
   */
  async findProviderCheckBySearchId(searchId: string) {
    return this.prisma.providerCheck.findFirst({
      where: {
        requestId: searchId,
      },
      include: {
        verification: true,
      },
    });
  }

  /**
   * Update provider check with webhook results
   */
  async updateProviderCheckFromWebhook(
    providerCheckId: string,
    webhookData: {
      status: string;
      results?: {
        matches: Array<{
          ssn: string;
          first_name: string;
          last_name: string;
          date_of_death?: string;
          confidence_score: number;
        }>;
        total_matches: number;
      };
      error?: {
        code: string;
        message: string;
      };
      completedAt: Date;
    },
  ) {
    const { status, results, error, completedAt } = webhookData;

    // Update the provider check with webhook results
    const updatedCheck = await this.prisma.providerCheck.update({
      where: { id: providerCheckId },
      data: {
        result: JSON.stringify({
          status,
          results,
          error,
          webhookReceivedAt: completedAt.toISOString(),
        }),
        raw: {
          webhookStatus: status,
          webhookResults: results,
          webhookError: error,
          processedAt: completedAt.toISOString(),
        },
      },
      include: {
        verification: true,
      },
    });

    this.logger.log("Updated provider check with webhook results", {
      providerCheckId,
      status,
      hasResults: !!results,
      hasError: !!error,
    });

    // If this was a successful DMF check, update verification case status
    if (status === "completed" && results) {
      await this.handleDmfWebhookSuccess(updatedCheck, results);
    } else if (status === "failed" || status === "error") {
      await this.handleDmfWebhookError(updatedCheck, error);
    }

    return updatedCheck;
  }

  /**
   * Handle successful DMF webhook response
   */
  private async handleDmfWebhookSuccess(
    providerCheck: {
      id: string;
      verification: {
        id: string;
        status: VerificationStatus;
        reasonCodes: string[];
      };
    },
    results: {
      matches: Array<{
        ssn: string;
        first_name: string;
        last_name: string;
        date_of_death?: string;
        confidence_score: number;
      }>;
      total_matches: number;
    },
  ) {
    const { verification } = providerCheck;

    // Calculate overall match score based on DMF results
    const matchScore = results.matches?.[0]?.confidence_score || 0;
    const hasMatches = results.total_matches > 0;

    // Update verification case status based on results
    let newStatus = verification.status;
    const reasonCodes = [...(verification.reasonCodes || [])];

    if (hasMatches && matchScore >= 0.8) {
      // High confidence match found
      newStatus = VerificationStatus.IN_REVIEW;
      if (!reasonCodes.includes("DMF_MATCH_FOUND")) {
        reasonCodes.push("DMF_MATCH_FOUND");
      }
    } else if (hasMatches && matchScore >= 0.5) {
      // Medium confidence match - needs manual review
      newStatus = VerificationStatus.IN_REVIEW;
      if (!reasonCodes.includes("DMF_PARTIAL_MATCH")) {
        reasonCodes.push("DMF_PARTIAL_MATCH");
      }
    } else {
      // No matches or low confidence
      if (!reasonCodes.includes("DMF_NO_MATCH")) {
        reasonCodes.push("DMF_NO_MATCH");
      }
    }

    await this.prisma.verificationCase.update({
      where: { id: verification.id },
      data: {
        status: newStatus,
        reasonCodes,
        updatedAt: new Date(),
      },
    });

    this.logger.log("Updated verification case from DMF webhook", {
      caseId: verification.id,
      newStatus,
      matchScore,
      totalMatches: results.total_matches,
    });
  }

  /**
   * Handle failed DMF webhook response
   */
  private async handleDmfWebhookError(
    providerCheck: {
      id: string;
      verification: {
        id: string;
        status: VerificationStatus;
        reasonCodes: string[];
      };
    },
    error: { code: string; message: string } | undefined,
  ) {
    const { verification } = providerCheck;

    const reasonCodes = [...(verification.reasonCodes || [])];
    if (!reasonCodes.includes("DMF_CHECK_FAILED")) {
      reasonCodes.push("DMF_CHECK_FAILED");
    }

    await this.prisma.verificationCase.update({
      where: { id: verification.id },
      data: {
        status: VerificationStatus.IN_REVIEW, // Manual review needed due to error
        reasonCodes,
        updatedAt: new Date(),
      },
    });

    this.logger.error("DMF check failed, updated verification case", {
      caseId: verification.id,
      error: error?.message || "Unknown error",
      errorCode: error?.code,
    });
  }

  /**
   * Get public verification summary for a memorial (no sensitive data exposed)
   */
  async getPublicVerificationSummary(
    memorialId: string,
  ): Promise<VerificationSummaryDto> {
    // Find the memorial and its verification case
    const memorial = await this.prisma.memorial.findUnique({
      where: { id: memorialId },
      include: {
        verificationCase: {
          include: {
            providerChecks: {
              select: {
                id: true,
                provider: true,
                matchScore: true,
                result: true,
                createdAt: true,
                // Exclude sensitive raw data and requestId
              },
            },
            manualReviews: {
              select: {
                id: true,
                decision: true,
                createdAt: true,
                decidedAt: true,
                // Exclude reviewer info and notes for privacy
              },
            },
          },
        },
      },
    });

    if (!memorial) {
      throw new NotFoundException("Memorial not found");
    }

    const verificationCase = memorial.verificationCase;

    // Determine verified fields based on verification status
    const verifiedFields: string[] = [];
    if (
      memorial.verificationStatus === VerificationStatus.APPROVED ||
      verificationCase?.status === VerificationStatus.APPROVED
    ) {
      verifiedFields.push("identity", "death_confirmation");
    }

    // Return safe public summary - simplified for public consumption
    return {
      status: memorial.verificationStatus,
      verifiedFields,
      lastCheckedAt: verificationCase?.updatedAt?.toISOString(),
      hasVerifiedDeathCertificate:
        memorial.verificationStatus === VerificationStatus.APPROVED,
    };
  }
}
