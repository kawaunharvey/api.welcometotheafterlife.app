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
} from "./verification.dto";
import { VerificationStatus } from "@prisma/client";

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
    let existingCase = await this.prisma.verificationCase.findUnique({
      where: { memorialId: dto.memorialId },
      include: {
        secrets: true,
        documents: true,
        providerChecks: true,
        manualReviews: true,
      },
    });

    // Prepare verification inputs
    let ssnLast4: string | undefined;
    let hashedSsn: string | undefined;
    let hashedCertId: string | undefined;
    let encryptedSsnData: any = {};

    // Process SSN if provided
    if (dto.ssn) {
      const cleanSsn = this.sensitiveDataService.cleanSsn(dto.ssn);
      const extractedLast4 =
        this.sensitiveDataService.extractSsnLast4(cleanSsn);
      ssnLast4 = extractedLast4 || undefined;
      hashedSsn = await this.sensitiveDataService.hashSensitiveData(cleanSsn);

      // Encrypt full SSN temporarily
      const encrypted =
        this.sensitiveDataService.encryptSensitiveData(cleanSsn);
      encryptedSsnData = {
        encFullSsn: encrypted.encValue,
        encSsnIv: encrypted.encIv,
        encSsnAuthTag: encrypted.encAuthTag,
        hashedSsn,
        lastUsedAt: new Date(),
      };
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

    let verificationCase: any;

    if (existingCase) {
      // Update existing case
      verificationCase = await this.prisma.verificationCase.update({
        where: { id: existingCase.id },
        data: {
          inputs: inputsData as any,
          updatedAt: new Date(),
          // Reset comparison if inputs changed significantly
          comparison: undefined,
        },
        include: {
          secrets: true,
          documents: true,
          providerChecks: true,
          manualReviews: true,
        },
      });

      // Update or create secrets
      if (dto.ssn || dto.deathCertificateId) {
        const secretsUpdateData: any = {};

        if (dto.ssn) {
          Object.assign(secretsUpdateData, encryptedSsnData);
        } else if (existingCase.secrets) {
          // Clear SSN data if not provided in update
          secretsUpdateData.encFullSsn = null;
          secretsUpdateData.encSsnIv = null;
          secretsUpdateData.encSsnAuthTag = null;
          secretsUpdateData.hashedSsn = null;
        }

        if (dto.deathCertificateId) {
          secretsUpdateData.hashedCertId = hashedCertId;
        } else if (existingCase.secrets) {
          secretsUpdateData.hashedCertId = null;
        }

        if (existingCase.secrets) {
          await this.prisma.verificationSecret.update({
            where: { verificationId: existingCase.id },
            data: secretsUpdateData,
          });
        } else {
          await this.prisma.verificationSecret.create({
            data: {
              verificationId: existingCase.id,
              ...secretsUpdateData,
            },
          });
        }
      }

      this.logger.log("Verification case updated", {
        caseId: verificationCase.id,
        memorialId: dto.memorialId,
      });
    } else {
      // Create new case
      verificationCase = await this.prisma.verificationCase.create({
        data: {
          memorialId: dto.memorialId,
          submittedBy: userId,
          inputs: inputsData as any,
          status: VerificationStatus.PENDING,
          reasonCodes: [],
        },
        include: {
          secrets: true,
          documents: true,
          providerChecks: true,
          manualReviews: true,
        },
      });

      // Create secrets if we have sensitive data
      if (dto.ssn || dto.deathCertificateId) {
        await this.prisma.verificationSecret.create({
          data: {
            verificationId: verificationCase.id,
            ...encryptedSsnData,
            hashedCertId,
          },
        });
      }

      // Update memorial verification status
      await this.prisma.memorial.update({
        where: { id: dto.memorialId },
        data: { verificationStatus: VerificationStatus.PENDING },
      });

      this.logger.log("Verification case created", {
        caseId: verificationCase.id,
        memorialId: dto.memorialId,
      });
    }

    return this.mapToResponseDto(verificationCase);
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
        secrets: true,
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
   * Update verification case inputs
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
        secrets: true,
      },
    });

    if (!existingCase) {
      throw new NotFoundException("Verification case not found");
    }

    if (existingCase.memorial.ownerUserId !== userId) {
      throw new ForbiddenException("Access denied to this verification case");
    }

    // Merge existing inputs with updates
    const existingInputs = existingCase.inputs as any;

    let ssnLast4 = existingInputs.ssnLast4;
    let hashedSsn: string | undefined;
    let hashedCertId: string | undefined;
    let encryptedSsnData: any = {};

    // Process SSN updates
    if (dto.ssn !== undefined) {
      if (dto.ssn) {
        const cleanSsn = this.sensitiveDataService.cleanSsn(dto.ssn);
        ssnLast4 = this.sensitiveDataService.extractSsnLast4(cleanSsn);
        hashedSsn = await this.sensitiveDataService.hashSensitiveData(cleanSsn);

        const encrypted =
          this.sensitiveDataService.encryptSensitiveData(cleanSsn);
        encryptedSsnData = {
          encFullSsn: encrypted.encValue,
          encSsnIv: encrypted.encIv,
          encSsnAuthTag: encrypted.encAuthTag,
          hashedSsn,
          lastUsedAt: new Date(),
        };
      } else {
        // Clear SSN data
        ssnLast4 = undefined;
        encryptedSsnData = {
          encFullSsn: null,
          encSsnIv: null,
          encSsnAuthTag: null,
          hashedSsn: null,
        };
      }
    }

    // Process death certificate ID updates
    if (dto.deathCertificateId !== undefined) {
      if (dto.deathCertificateId) {
        hashedCertId = await this.sensitiveDataService.hashSensitiveData(
          dto.deathCertificateId,
        );
      } else {
        hashedCertId = undefined;
      }
    }

    const updatedInputs = {
      fullName: dto.fullName ?? existingInputs.fullName,
      dateOfBirth: dto.dateOfBirth
        ? new Date(dto.dateOfBirth)
        : existingInputs.dateOfBirth,
      dateOfPassing: dto.dateOfPassing
        ? new Date(dto.dateOfPassing)
        : existingInputs.dateOfPassing,
      ssnLast4,
      certificateNumber:
        dto.certificateNumber ?? existingInputs.certificateNumber,
      state: dto.state ?? existingInputs.state,
      county: dto.county ?? existingInputs.county,
      deathCertificateId:
        dto.deathCertificateId ?? existingInputs.deathCertificateId,
    };

    // Update the case
    const updatedCase = await this.prisma.verificationCase.update({
      where: { id: caseId },
      data: {
        inputs: updatedInputs as any,
        updatedAt: new Date(),
      },
      include: {
        secrets: true,
        documents: true,
        providerChecks: true,
        manualReviews: true,
      },
    });

    // Update secrets if necessary
    if (dto.ssn !== undefined || dto.deathCertificateId !== undefined) {
      const secretsUpdateData: any = {};

      if (dto.ssn !== undefined) {
        Object.assign(secretsUpdateData, encryptedSsnData);
      }

      if (dto.deathCertificateId !== undefined) {
        secretsUpdateData.hashedCertId = hashedCertId;
      }

      if (existingCase.secrets) {
        await this.prisma.verificationSecret.update({
          where: { verificationId: caseId },
          data: secretsUpdateData,
        });
      } else if (Object.keys(secretsUpdateData).length > 0) {
        await this.prisma.verificationSecret.create({
          data: {
            verificationId: caseId,
            ...secretsUpdateData,
          },
        });
      }
    }

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
      documents.forEach((doc) => {
        verifiedFields.push(...doc.verifiedFields);
        if (doc.kind === "death_certificate" && doc.verifiedFields.length > 0) {
          hasVerifiedDeathCertificate = true;
        }
      });

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
   * Map database entity to response DTO (safely excludes sensitive data)
   */
  private mapToResponseDto(verificationCase: any): VerificationCaseResponseDto {
    const inputs = verificationCase.inputs;

    return {
      id: verificationCase.id,
      memorialId: verificationCase.memorialId,
      submittedBy: verificationCase.submittedBy,
      inputs: {
        fullName: inputs.fullName,
        dateOfBirth: inputs.dateOfBirth?.toISOString(),
        dateOfPassing: inputs.dateOfPassing?.toISOString(),
        ssnLast4: inputs.ssnLast4,
        certificateNumber: inputs.certificateNumber,
        state: inputs.state,
        county: inputs.county,
        // NEVER expose actual deathCertificateId in API responses
        deathCertificateId: inputs.deathCertificateId ? "***" : undefined,
      },
      comparison: verificationCase.comparison || undefined,
      status: verificationCase.status,
      reasonCodes: verificationCase.reasonCodes,
      decidedAt: verificationCase.decidedAt?.toISOString(),
      createdAt: verificationCase.createdAt.toISOString(),
      updatedAt: verificationCase.updatedAt.toISOString(),
      securityInfo: verificationCase.secrets
        ? {
            hasEncryptedSsn: !!verificationCase.secrets.encFullSsn,
            hasHashedSsn: !!verificationCase.secrets.hashedSsn,
            hasHashedCertId: !!verificationCase.secrets.hashedCertId,
            lastUsedAt: verificationCase.secrets.lastUsedAt?.toISOString(),
          }
        : undefined,
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
}
