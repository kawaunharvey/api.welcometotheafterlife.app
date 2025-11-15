import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Request,
  Logger,
} from "@nestjs/common";
import { VerificationService } from "./verification-simple.service";
import {
  CreateVerificationCaseDto,
  UpdateVerificationCaseInputsDto,
  VerificationCaseResponseDto,
  VerificationSummaryDto,
  RunDmfCheckDto,
  CreateManualReviewDto,
} from "./verification.dto";

interface AuthenticatedRequest {
  user: {
    id: string;
    sub?: string;
  };
}

@Controller("verification")
export class VerificationController {
  private readonly logger = new Logger(VerificationController.name);

  constructor(private verificationService: VerificationService) {}

  /**
   * Create or update a verification case
   */
  @Post("cases")
  async createCase(
    @Body() dto: CreateVerificationCaseDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<VerificationCaseResponseDto> {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error("User ID not found in request");
    }
    return this.verificationService.createOrUpdateCase(dto, userId);
  }

  /**
   * Get verification case by ID
   */
  @Get("cases/:id")
  async getCase(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<VerificationCaseResponseDto> {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error("User ID not found in request");
    }
    return this.verificationService.getCaseById(id, userId);
  }

  /**
   * Update verification case inputs
   */
  @Patch("cases/:id/inputs")
  async updateCaseInputs(
    @Param("id") id: string,
    @Body() dto: UpdateVerificationCaseInputsDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<VerificationCaseResponseDto> {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error("User ID not found in request");
    }
    return this.verificationService.updateCaseInputs(id, dto, userId);
  }

  /**
   * Run DMF provider check for a verification case
   */
  @Post("cases/:id/provider-checks/dmf")
  async runDmfCheck(
    @Param("id") id: string,
    @Body() dto: RunDmfCheckDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string; providerCheckId?: string }> {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error("User ID not found in request");
    }
    return this.verificationService.runDmfCheck(id, dto, userId);
  }

  /**
   * Submit manual review decision for a verification case
   */
  @Post("cases/:id/manual-reviews")
  async submitManualReview(
    @Param("id") id: string,
    @Body() dto: CreateManualReviewDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string; reviewId: string }> {
    const userId = req.user?.id || req.user?.sub;
    if (!userId) {
      throw new Error("User ID not found in request");
    }
    return this.verificationService.submitManualReview(id, dto, userId);
  }
}

@Controller("memorials")
export class MemorialVerificationController {
  private readonly logger = new Logger(MemorialVerificationController.name);

  constructor(private verificationService: VerificationService) {}

  /**
   * Get public verification summary for a memorial
   */
  @Get(":id/verification-summary")
  async getVerificationSummary(
    @Param("id") id: string,
  ): Promise<VerificationSummaryDto> {
    return this.verificationService.getPublicVerificationSummary(id);
  }
}
