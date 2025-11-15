import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiBody,
  ApiBadRequestResponse,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import {
  SendVerificationCodeDto,
  VerifyCodeAndLoginDto,
  GoogleOAuthCallbackDto,
  FacebookOAuthCallbackDto,
  AppleOAuthCallbackDto,
  AuthTokenResponseDto,
} from "./dto/auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger("AuthController");

  constructor(private authService: AuthService) {}

  /**
   * Send verification code to email.
   */
  @Post("send-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Send 5-digit verification code to email",
    description:
      "Sends a verification code to the user's email for login authentication",
  })
  @ApiBody({ type: SendVerificationCodeDto })
  @ApiOkResponse({
    description: "Verification code sent successfully",
    schema: {
      properties: {
        message: { type: "string" },
        expiresIn: { type: "number" },
      },
    },
  })
  @ApiBadRequestResponse({ description: "Invalid email format" })
  async sendVerificationCode(@Body() dto: SendVerificationCodeDto) {
    await this.authService.sendVerificationCode(dto.email);
    return {
      message: "Verification code sent to your email",
      expiresIn: 600, // 10 minutes
    };
  }

  /**
   * Verify code and login.
   */
  @Post("verify-login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify code and login",
    description:
      "Verify the 5-digit code and return JWT token. Creates user if first login.",
  })
  @ApiBody({ type: VerifyCodeAndLoginDto })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description: "Login successful, JWT token returned",
  })
  @ApiBadRequestResponse({
    description: "Invalid or expired code, or too many attempts",
  })
  async verifyCodeAndLogin(
    @Body() dto: VerifyCodeAndLoginDto,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.authService.verifyCodeAndLogin(dto);

    this.logger.log(`User logged in via email: ${result.email}`);

    return result;
  }

  /**
   * Google OAuth login.
   */
  @Post("google")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Login with Google OAuth",
    description: "Authenticate using Google OAuth authorization code",
  })
  @ApiBody({ type: GoogleOAuthCallbackDto })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description: "Google login successful, JWT token returned",
  })
  @ApiBadRequestResponse({ description: "Invalid Google authorization code" })
  async googleOAuth(
    @Body() dto: GoogleOAuthCallbackDto,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.authService.googleOAuthLogin(dto);

    this.logger.log(`User logged in via Google: ${result.userId}`);

    return result;
  }

  /**
   * Facebook OAuth login.
   */
  @Post("facebook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Login with Facebook OAuth",
    description: "Authenticate using Facebook OAuth access token",
  })
  @ApiBody({ type: FacebookOAuthCallbackDto })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description: "Facebook login successful, JWT token returned",
  })
  @ApiBadRequestResponse({ description: "Invalid Facebook access token" })
  async facebookOAuth(
    @Body() dto: FacebookOAuthCallbackDto,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.authService.facebookOAuthLogin(dto);

    this.logger.log(`User logged in via Facebook: ${result.userId}`);

    return result;
  }

  /**
   * Apple OAuth login.
   */
  @Post("apple")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Login with Apple OAuth",
    description:
      "Authenticate using Apple OAuth authorization code and identity token",
  })
  @ApiBody({ type: AppleOAuthCallbackDto })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description: "Apple login successful, JWT token returned",
  })
  @ApiBadRequestResponse({
    description: "Invalid Apple authorization code or identity token",
  })
  async appleOAuth(
    @Body() dto: AppleOAuthCallbackDto,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.authService.appleOAuthLogin(dto);

    this.logger.log(`User logged in via Apple: ${result.userId}`);

    return result;
  }
}
