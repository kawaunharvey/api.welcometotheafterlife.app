import {
  Controller,
  Post,
  Get,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  HttpCode,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiOperation,
  ApiBody,
} from "@nestjs/swagger";
import { MemorialsService } from "./memorials.service";
import { MemorialObituaryService } from "./memorial-obituary.service";
import {
  CreateMemorialDto,
  UpdateMemorialDto,
  MemorialResponseDto,
} from "./dto/memorial.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CurrentUser,
  CurrentUserContext,
} from "../auth/current-user.decorator";
import { SessionAnswerDto } from "./dto/obituary.dto";

@ApiTags("memorials")
@Controller("memorials")
export class MemorialsController {
  constructor(
    private memorialsService: MemorialsService,
    private memorialObituaryService: MemorialObituaryService,
  ) {}

  /**
   * Create a new memorial.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new memorial" })
  @ApiCreatedResponse({ type: MemorialResponseDto })
  async create(
    @Body() dto: CreateMemorialDto,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<MemorialResponseDto> {
    try {
      return this.memorialsService.create(dto, user.userId);
    } catch (error) {
      throw new BadRequestException("Failed to create memorial");
    }
  }

  /**
   * Get memorial by ID.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get memorial by ID" })
  @ApiOkResponse({ type: MemorialResponseDto })
  async getById(
    @Param("id") id: string,
    @CurrentUser() user?: CurrentUserContext,
  ): Promise<MemorialResponseDto> {
    return this.memorialsService.getById(id, user?.userId);
  }

  /**
   * List memorials.
   */
  @Get()
  @ApiOperation({ summary: "List memorials" })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "tags", required: false, type: [String] })
  @ApiOkResponse({ type: [MemorialResponseDto] })
  async list(
    @Query("query") query?: string,
    @Query("tags") tags?: string | string[],
    @CurrentUser() user?: CurrentUserContext,
  ): Promise<MemorialResponseDto[]> {
    const tagArray = Array.isArray(tags) ? tags : tags ? [tags] : undefined;
    return this.memorialsService.list(query, tagArray, user?.userId);
  }

  /**
   * Update memorial.
   */
  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: "Update memorial" })
  @ApiOkResponse({ type: MemorialResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateMemorialDto,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<MemorialResponseDto> {
    return this.memorialsService.update(id, dto, user.userId);
  }

  /**
   * Archive memorial.
   */
  @Patch(":id/archive")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: "Toggle memorial archive status" })
  @ApiOkResponse({ type: MemorialResponseDto })
  async toggleArchive(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserContext,
  ): Promise<MemorialResponseDto> {
    return this.memorialsService.toggleArchive(id, user.userId);
  }

  /**
   * Create upload session for memorial images.
   */
  @Post(":id/upload/images/session")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create upload session for memorial images" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        filename: { type: "string", example: "memorial-photo.jpg" },
        mimeType: { type: "string", example: "image/jpeg" },
        sizeBytes: { type: "number", example: 1024000 },
      },
      required: ["filename", "mimeType", "sizeBytes"],
    },
  })
  async createImageUploadSession(
    @Param("id") id: string,
    @Body()
    body: {
      filename: string;
      mimeType: string;
      sizeBytes: number;
    },
    @CurrentUser() user: CurrentUserContext,
  ) {
    return this.memorialsService.createImageUploadSession(
      body.filename,
      body.mimeType,
      body.sizeBytes,
      user.userId,
      id,
    );
  }

  /**
   * Create upload session for memorial documents.
   */
  @Post(":id/upload/documents/session")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create upload session for memorial documents" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        filename: { type: "string", example: "memorial-document.pdf" },
        mimeType: { type: "string", example: "application/pdf" },
        sizeBytes: { type: "number", example: 1024000 },
      },
      required: ["filename", "mimeType", "sizeBytes"],
    },
  })
  async createDocumentUploadSession(
    @Param("id") id: string,
    @Body()
    body: {
      filename: string;
      mimeType: string;
      sizeBytes: number;
    },
    @CurrentUser() user: CurrentUserContext,
  ) {
    return this.memorialsService.createDocumentUploadSession(
      body.filename,
      body.mimeType,
      body.sizeBytes,
      user.userId,
      id,
    );
  }

  /**
   * Complete upload session.
   */
  @Post(":id/upload/session/:sessionId/complete")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Complete upload session" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        assetMeta: {
          type: "object",
          example: { title: "Memorial Photo", description: "Family gathering" },
        },
      },
    },
  })
  async completeUploadSession(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Body() body: { assetMeta?: Record<string, unknown> },
    @CurrentUser() user: CurrentUserContext,
  ) {
    return this.memorialsService.completeUploadSession(
      sessionId,
      user.userId,
      id,
      body.assetMeta,
    );
  }

  // ==================== Obituary Endpoints ====================

  /**
   * Start a questionnaire session for a memorial
   */
  @Post(":id/obituary/questionnaire/start")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Start obituary questionnaire for memorial" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        maxQuestions: { type: "number", example: 15 },
      },
    },
  })
  async startQuestionnaire(
    @Param("id") memorialId: string,
    @Body() body: {
      maxQuestions?: number;
      keyLocationsText?: string;
      deceasedFullName?: string;
      yearOfBirth?: number;
      yearOfPassing?: number;
    },
    @CurrentUser() user: CurrentUserContext,
  ) {
    return this.memorialObituaryService.startQuestionnaire(
      memorialId,
      user.userId,
      body.maxQuestions,
      body.deceasedFullName,
      body.yearOfBirth,
      body.yearOfPassing,
      body.keyLocationsText,
    );
  }

  /**
   * Get questionnaire session progress
   */
  @Get("obituary/questionnaire/:sessionId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get questionnaire session progress" })
  async getQuestionnaireSession(@Param("sessionId") sessionId: string) {
    return this.memorialObituaryService.getQuestionnaireSession(sessionId);
  }

  /**
   * Get current question in questionnaire
   */
  @Get("obituary/questionnaire/:sessionId/current")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current question in questionnaire" })
  async getCurrentQuestion(@Param("sessionId") sessionId: string) {
    return this.memorialObituaryService.getCurrentQuestion(sessionId);
  }

  /**
   * Answer a question in the questionnaire
   */
  @Post("obituary/questionnaire/:sessionId/answer")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Answer questionnaire question" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          example: "He was a loving father and husband...",
        },
      },
      required: ["answer"],
    },
  })
  async answerQuestion(
    @Param("sessionId") sessionId: string,
    @Body() body: SessionAnswerDto,
  ) {
    return this.memorialObituaryService.answerQuestion(sessionId, body);
  }

  /**
   * Skip a question in the questionnaire
   */
  @Post("obituary/questionnaire/:sessionId/skip")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Skip questionnaire question" })
  @HttpCode(200)
  async skipQuestion(@Param("sessionId") sessionId: string) {
    return this.memorialObituaryService.skipQuestion(sessionId);
  }

  /**
   * Generate follow-up questions
   */
  @Post("obituary/questionnaire/:sessionId/followup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Generate follow-up questions" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        context: { type: "string", example: "Tell me more about his career" },
        previousAnswer: { type: "string", example: "He was an engineer" },
      },
    },
  })
  async generateFollowUp(
    @Param("sessionId") sessionId: string,
    @Body() body: { context?: string; previousAnswer?: string },
  ) {
    return this.memorialObituaryService.generateFollowUp(
      sessionId,
      body.context,
      body.previousAnswer,
    );
  }

  /**
   * Submit additional context for questionnaire
   */
  @Post("obituary/questionnaire/:sessionId/additional-context")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Submit additional context for questionnaire" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        additionalContext: {
          type: "string",
          example: "He had a great sense of humor and loved telling stories...",
        },
      },
      required: ["additionalContext"],
    },
  })
  @HttpCode(200)
  async submitAdditionalContext(
    @Param("sessionId") sessionId: string,
    @Body() body: { additionalContext: string },
  ) {
    return this.memorialObituaryService.submitAdditionalContext(
      sessionId,
      body.additionalContext,
    );
  }

  /**
   * Update key locations for an existing questionnaire session
   */
  @Post("obituary/questionnaire/:sessionId/key-locations")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update key locations for questionnaire" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        keyLocationsText: {
          type: "string",
          example:
            "London where she grew up; Atlanta where she built her career",
        },
      },
      required: ["keyLocationsText"],
    },
  })
  @HttpCode(200)
  async updateKeyLocations(
    @Param("sessionId") sessionId: string,
    @Body() body: { keyLocationsText: string },
  ) {
    return this.memorialObituaryService.updateKeyLocations(
      sessionId,
      body.keyLocationsText,
    );
  }

  /**
   * Generate obituary draft from questionnaire answers
   */
  @Post("obituary/draft/:sessionId/generate")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Generate obituary draft from questionnaire" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        tone: {
          type: "string",
          enum: ["RESPECTFUL", "WARM", "CELEBRATORY", "TRADITIONAL", "MODERN"],
          example: "RESPECTFUL",
        },
        length: {
          type: "string",
          enum: ["SHORT", "MEDIUM", "LONG"],
          example: "MEDIUM",
        },
        includePersonalDetails: { type: "boolean", example: true },
        includeFamily: { type: "boolean", example: true },
        includeCareer: { type: "boolean", example: true },
        includeHobbies: { type: "boolean", example: false },
        customInstructions: {
          type: "string",
          example: "Focus on his community involvement",
        },
      },
    },
  })
  async generateDraft(
    @Param("sessionId") sessionId: string,
    @Body() body: {
      tone?: "RESPECTFUL" | "WARM" | "CELEBRATORY" | "TRADITIONAL" | "MODERN";
      length?: "SHORT" | "MEDIUM" | "LONG";
      includePersonalDetails?: boolean;
      includeFamily?: boolean;
      includeCareer?: boolean;
      includeHobbies?: boolean;
      customInstructions?: string;
    },
  ) {
    const { draft, memorialId } =
      await this.memorialObituaryService.generateDraft(sessionId, body);
    return { draft, memorialId };
  }

  /**
   * Regenerate existing draft with different parameters
   */
  @Post("obituary/draft/:draftId/regenerate")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Regenerate existing obituary draft" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        tone: {
          type: "string",
          enum: ["RESPECTFUL", "WARM", "CELEBRATORY", "TRADITIONAL", "MODERN"],
          example: "WARM",
        },
        length: {
          type: "string",
          enum: ["SHORT", "MEDIUM", "LONG"],
          example: "LONG",
        },
        includePersonalDetails: { type: "boolean", example: true },
        includeFamily: { type: "boolean", example: true },
        includeCareer: { type: "boolean", example: false },
        includeHobbies: { type: "boolean", example: true },
        customInstructions: {
          type: "string",
          example: "Make it more celebratory",
        },
      },
    },
  })
  async regenerateDraft(
    @Param("draftId") draftId: string,
    @Body() body: {
      tone?: "RESPECTFUL" | "WARM" | "CELEBRATORY" | "TRADITIONAL" | "MODERN";
      length?: "SHORT" | "MEDIUM" | "LONG";
      includePersonalDetails?: boolean;
      includeFamily?: boolean;
      includeCareer?: boolean;
      includeHobbies?: boolean;
      customInstructions?: string;
    },
  ) {
    const { draft, memorialId } =
      await this.memorialObituaryService.regenerateDraft(draftId, body);
    return { draft, memorialId };
  }

  /**
   * Generate caption variants for a memorial's draft
   */
  @Post(":id/obituary/draft/:draftId/captions")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Generate captions for an obituary draft" })
  async generateCaptions(
    @Param("id") memorialId: string,
    @Param("draftId") draftId: string,
    @CurrentUser() user: CurrentUserContext,
  ) {
    return this.memorialObituaryService.generateDraftCaptions(
      memorialId,
      draftId,
      user.userId,
    );
  }

  /**
   * Get caption variants for a memorial's draft
   */
  @Get(":id/obituary/draft/:draftId/captions")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get captions for an obituary draft" })
  async getCaptions(
    @Param("id") memorialId: string,
    @Param("draftId") draftId: string,
    @CurrentUser() user: CurrentUserContext,
  ) {
    return this.memorialObituaryService.getDraftCaptions(
      memorialId,
      draftId,
      user.userId,
    );
  }

  /**
   * Publish a generated obituary draft and store the published copy
   */
  @Post(":id/obituary/draft/:draftId/publish")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Publish an obituary draft" })
  async publishDraft(
    @Param("id") memorialId: string,
    @Param("draftId") draftId: string,
    @CurrentUser() user: CurrentUserContext,
  ) {
    return this.memorialObituaryService.publishDraft(
      memorialId,
      draftId,
      user.userId,
    );
  }

  /**
   * Get the latest published obituary for a memorial
   */
  @Get(":id/obituary/published")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get latest published obituary" })
  async getPublishedObituary(@Param("id") memorialId: string) {
    return this.memorialObituaryService.getPublishedObituary(memorialId);
  }

  /**
   * Get specific obituary draft by ID
   */
  @Get("obituary/draft/:draftId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get obituary draft by ID" })
  async getDraft(@Param("draftId") draftId: string) {
    return this.memorialObituaryService.getDraft(draftId);
  }

  /**
   * Get all drafts for a session
   */
  @Get("obituary/session/:sessionId/drafts")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all drafts for a questionnaire session" })
  async getSessionDrafts(@Param("sessionId") sessionId: string) {
    return this.memorialObituaryService.getSessionDrafts(sessionId);
  }

  /**
   * Get latest draft for a session
   */
  @Get("obituary/session/:sessionId/latest")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get latest draft for a questionnaire session" })
  async getLatestDraft(@Param("sessionId") sessionId: string) {
    return this.memorialObituaryService.getLatestDraft(sessionId);
  }

  /**
   * Get obituary for a memorial
   */
  @Get(":id/obituary")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get obituary for memorial" })
  async getMemorialObituary(@Param("id") memorialId: string) {
    return this.memorialObituaryService.getMemorialObituary(memorialId);
  }

  /**
   * Estimate cost for draft generation
   */
  @Post("obituary/draft/:sessionId/estimate-cost")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Estimate cost for draft generation" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        tone: { type: "string", example: "RESPECTFUL" },
        length: { type: "string", example: "MEDIUM" },
        includePersonalDetails: { type: "boolean", example: true },
        includeFamily: { type: "boolean", example: true },
        includeCareer: { type: "boolean", example: true },
        includeHobbies: { type: "boolean", example: false },
        customInstructions: {
          type: "string",
          example: "Focus on achievements",
        },
      },
    },
  })
  async estimateCost(
    @Param("sessionId") sessionId: string,
    @Body() body: {
      tone?: string;
      length?: string;
      includePersonalDetails?: boolean;
      includeFamily?: boolean;
      includeCareer?: boolean;
      includeHobbies?: boolean;
      customInstructions?: string;
    },
  ) {
    return this.memorialObituaryService.estimateCost(sessionId, body);
  }

  /**
   * Get obituary questionnaire status for a memorial
   */
  @Get(":id/obituary/status")
  @ApiOperation({ summary: "Get obituary questionnaire status" })
  @ApiOkResponse({
    description: "Returns obituary session status for memorial",
  })
  async getObituaryStatus(
    @Param("id") memorialId: string,
    @CurrentUser() user?: CurrentUserContext,
  ) {
    return this.memorialObituaryService.getObituaryStatus(
      memorialId,
      user?.userId,
    );
  }
}
