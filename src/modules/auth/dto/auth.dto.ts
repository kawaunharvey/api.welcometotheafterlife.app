import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsString, Length, IsOptional } from "class-validator";

// ==================== Email Auth ====================

export class SendVerificationCodeDto {
  @ApiProperty({ description: "User email address" })
  @IsEmail()
  email!: string;
}

export class VerifyCodeAndLoginDto {
  @ApiProperty({ description: "User email address" })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: "5-digit verification code" })
  @IsString()
  @Length(5, 5, { message: "Code must be exactly 5 digits" })
  code!: string;

  @ApiPropertyOptional({ description: "Optional display name on first login" })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ description: "Optional username on first login" })
  @IsOptional()
  @IsString()
  @Length(3, 30)
  username?: string;

  @ApiPropertyOptional({ description: "Optional date of birth on first login" })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;
}

export class AuthTokenResponseDto {
  @ApiProperty({ description: "JWT access token" })
  token!: string;

  @ApiProperty({ description: "User ID" })
  userId!: string;

  @ApiProperty({ description: "User email" })
  email!: string;

  @ApiPropertyOptional({ description: "User display name" })
  name?: string | null;

  @ApiProperty({ description: "Token expiration time (seconds)" })
  expiresIn!: number;
}

// ==================== OAuth ====================

export class GoogleOAuthCallbackDto {
  @ApiProperty({ description: "Google OAuth code from frontend" })
  @IsString()
  code!: string;

  @ApiPropertyOptional({ description: "Optional display name" })
  @IsOptional()
  @IsString()
  name?: string;
}

export class FacebookOAuthCallbackDto {
  @ApiProperty({ description: "Facebook OAuth access token from frontend" })
  @IsString()
  token!: string;

  @ApiPropertyOptional({ description: "Optional display name" })
  @IsOptional()
  @IsString()
  name?: string;
}

export class AppleOAuthCallbackDto {
  @ApiProperty({ description: "Apple authorization code from frontend" })
  @IsString()
  code!: string;

  @ApiProperty({ description: "Apple identity token" })
  @IsString()
  identityToken!: string;

  @ApiPropertyOptional({ description: "User email (if provided by Apple)" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: "User name (if provided by Apple)" })
  @IsOptional()
  @IsString()
  name?: string;
}

// ==================== Internal ====================

export class VerificationCodeRecord {
  email: string;
  code: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}
