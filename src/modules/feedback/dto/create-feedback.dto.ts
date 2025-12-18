import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  FeedbackCategory,
  FeedbackChannel,
  FeedbackSentiment,
  FeedbackSeverity,
  FeedbackSource,
} from "@prisma/client";

class FeedbackAttachmentDto {
  @ApiPropertyOptional({ description: "Attachment asset identifier" })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({ description: "Direct URL to the attachment" })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({
    description: "Attachment type label",
    example: "screenshot",
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: "Attachment MIME type",
    example: "image/png",
  })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: "Attachment size in bytes" })
  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;
}

export class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackCategory })
  @IsEnum(FeedbackCategory)
  category: FeedbackCategory;

  @ApiProperty({ enum: FeedbackSentiment })
  @IsEnum(FeedbackSentiment)
  sentiment: FeedbackSentiment;

  @ApiPropertyOptional({ enum: FeedbackSeverity })
  @IsOptional()
  @IsEnum(FeedbackSeverity)
  severity?: FeedbackSeverity;

  @ApiPropertyOptional({ enum: FeedbackSource, default: FeedbackSource.WEB })
  @IsOptional()
  @IsEnum(FeedbackSource)
  source?: FeedbackSource;

  @ApiPropertyOptional({
    enum: FeedbackChannel,
    default: FeedbackChannel.IN_APP_FORM,
  })
  @IsOptional()
  @IsEnum(FeedbackChannel)
  channel?: FeedbackChannel;

  @ApiPropertyOptional({
    description: "Short title for the report",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @Length(3, 200)
  title?: string;

  @ApiProperty({ description: "Detailed description of the issue or feedback" })
  @IsString()
  @Length(5, 4000)
  body: string;

  @ApiPropertyOptional({ description: "Associated memorial ID" })
  @IsOptional()
  @IsString()
  memorialId?: string;

  @ApiPropertyOptional({ description: "Associated fundraising program ID" })
  @IsOptional()
  @IsString()
  fundraisingId?: string;

  @ApiPropertyOptional({ description: "Associated donation ID" })
  @IsOptional()
  @IsString()
  donationId?: string;

  @ApiPropertyOptional({ description: "Associated payout ID" })
  @IsOptional()
  @IsString()
  payoutId?: string;

  @ApiPropertyOptional({ description: "Client app version", example: "1.12.0" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional({ description: "Client platform", example: "ios" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @ApiPropertyOptional({ description: "Locale from client", example: "en-US" })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  locale?: string;

  @ApiPropertyOptional({
    description: "Timezone from client",
    example: "America/Los_Angeles",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @ApiPropertyOptional({ description: "Country code", example: "US" })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @ApiPropertyOptional({
    description: "Reporter email (if different from authenticated user)",
  })
  @IsOptional()
  @IsEmail()
  reporterEmail?: string;

  @ApiPropertyOptional({
    description: "Tags for triage",
    type: [String],
    maxItems: 25,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: "Attachment metadata",
    type: [FeedbackAttachmentDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedbackAttachmentDto)
  attachments?: FeedbackAttachmentDto[];

  @ApiPropertyOptional({ description: "External ticket identifier" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  linkedTicketId?: string;

  @ApiPropertyOptional({ description: "Request follow-up from support" })
  @IsOptional()
  @IsBoolean()
  followupRequired?: boolean;

  @ApiPropertyOptional({ description: "User consented to be contacted" })
  @IsOptional()
  @IsBoolean()
  consentedToContact?: boolean;

  @ApiPropertyOptional({ description: "Arbitrary metadata payload" })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
