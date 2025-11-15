import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import {
  AuthTokenResponseDto,
  VerifyCodeAndLoginDto,
  GoogleOAuthCallbackDto,
  FacebookOAuthCallbackDto,
  AppleOAuthCallbackDto,
} from "./dto/auth.dto";
import { JwtPayload } from "./jwt.strategy";
import { MailgunService } from "../mailgun/mailgun.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class AuthService {
  private readonly logger = new Logger("AuthService");
  private readonly codeExpirationMinutes = 10;
  private readonly maxCodeAttempts = 3;

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private configService: ConfigService,
    private mailgunService: MailgunService,
    private redisService: RedisService,
  ) {}

  /**
   * Send a 5-digit verification code to the user's email.
   */
  async sendVerificationCode(email: string): Promise<void> {
    const code = this.generateVerificationCode();
    const expiresAt = new Date(
      Date.now() + this.codeExpirationMinutes * 60 * 1000,
    );
    const key = `verify:${email}`;
    // Store code in Redis
    await this.redisService.set(
      key,
      { code, expiresAt: expiresAt.toISOString(), attempts: 0 },
      this.codeExpirationMinutes * 60,
    );

    this.logger.debug(
      `[DEV] Verification code for ${email}: ${code} (expires at ${expiresAt.toISOString()})`,
    );

    const demoUserEmail = this.configService.get<string>("DEMO_USER_EMAIL");
    if (demoUserEmail && email === demoUserEmail) {
      const isProd =
        this.configService.get<string>("NODE_ENV") === "production";
      // delete the demo user data if the account is more than 1 hour old
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user && isProd) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (user.createdAt < oneHourAgo) {
          await this.deleteDemoUserData(email);
        }
      }

      this.logger.log(`Skipping email send for demo user ${demoUserEmail}`);
      return;
    }

    await this.mailgunService.sendMail({
      from: "Welcome to the Afterlife <no-reply@thehereafter.tech>",
      to: email,
      "o:testmode": Boolean(process.env?.MAILGUN_TEST_MODE === "yes"),
      subject: `✦ Welcome to the Afterlife — Verify your account`,
      html: `To continue, please enter the 5-digit code below in the app. This helps us confirm it's really you.<br /><br /><strong>Your code is ${code}</strong><br /><br />If you didn't try to sign up, you can safely ignore this email.<br /><br />— The Afterlife Awaits`,
    });
  }

  /**
   * Verify the code and login (or create user if first time).
   */
  async verifyCodeAndLogin(
    dto: VerifyCodeAndLoginDto,
  ): Promise<AuthTokenResponseDto> {
    const key = `verify:${dto.email}`;
    const storedRecord = await this.redisService.get<{
      code: string;
      expiresAt: string;
      attempts: number;
    }>(key);
    const isDemoUser =
      this.configService.get<string>("DEMO_USER_EMAIL") === dto.email;
    const demoUserCode = this.configService.get<string>("DEMO_USER_CODE");

    if (!storedRecord) {
      throw new BadRequestException(
        "No verification code found. Request a new code.",
      );
    }

    // Check expiration
    if (new Date() > new Date(storedRecord.expiresAt)) {
      await this.redisService.del(key);
      throw new BadRequestException("Verification code has expired.");
    }

    // Check attempts
    if (storedRecord.attempts >= this.maxCodeAttempts) {
      await this.redisService.del(key);
      throw new BadRequestException(
        "Too many failed attempts. Request a new code.",
      );
    }

    if (isDemoUser && dto.code === demoUserCode) {
      this.logger.debug(`Demo user ${dto.email} logged in with bypass code.`);
    } else {
      if (dto.code !== storedRecord.code) {
        // Increment attempts and update in Redis
        storedRecord.attempts++;
        await this.redisService.set(
          key,
          storedRecord,
          Math.floor(
            (new Date(storedRecord.expiresAt).getTime() - Date.now()) / 1000,
          ),
        );
        throw new BadRequestException("Invalid verification code.");
      }
    }
    // Code is valid, remove it
    await this.redisService.del(key);

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name || null,
          status: "ACTIVE",
          roles: ["user"],
        },
      });
    } else if (dto.name && !user.name) {
      // Update name if provided and user didn't have one
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { name: dto.name, lastLogin: new Date() },
      });
    } else {
      // Update lastLogin if user exists
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });
    }

    // Generate token
    return this.generateAuthResponse(user);
  }

  /**
   * Login with Google OAuth.
   */
  async googleOAuthLogin(
    dto: GoogleOAuthCallbackDto,
  ): Promise<AuthTokenResponseDto> {
    // TODO: Exchange code for tokens from Google
    // const googleUser = await this.exchangeGoogleCode(dto.code);

    // For now, mock implementation
    const mockEmail = `google-user-${crypto.randomBytes(4).toString("hex")}@google.com`;

    let user = await this.prisma.user.findUnique({
      where: { email: mockEmail },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: mockEmail,
          name: dto.name || "Google User",
          status: "ACTIVE",
          roles: ["user"],
        },
      });
    }

    this.logger.log(`Google OAuth login: ${user.id}`);
    return this.generateAuthResponse(user);
  }

  /**
   * Login with Facebook OAuth.
   */
  async facebookOAuthLogin(
    dto: FacebookOAuthCallbackDto,
  ): Promise<AuthTokenResponseDto> {
    // TODO: Validate token with Facebook API
    // const facebookUser = await this.validateFacebookToken(dto.token);

    // For now, mock implementation
    const mockEmail = `facebook-user-${crypto.randomBytes(4).toString("hex")}@facebook.com`;

    let user = await this.prisma.user.findUnique({
      where: { email: mockEmail },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: mockEmail,
          name: dto.name || "Facebook User",
          status: "ACTIVE",
          roles: ["user"],
        },
      });
    }

    this.logger.log(`Facebook OAuth login: ${user.id}`);
    return this.generateAuthResponse(user);
  }

  /**
   * Login with Apple OAuth.
   */
  async appleOAuthLogin(
    dto: AppleOAuthCallbackDto,
  ): Promise<AuthTokenResponseDto> {
    // TODO: Validate code and identityToken with Apple
    // const appleUser = await this.validateAppleToken(dto.code, dto.identityToken);

    // For now, use provided email or mock it
    const email =
      dto.email ||
      `apple-user-${crypto.randomBytes(4).toString("hex")}@apple.com`;

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          name: dto.name || "Apple User",
          status: "ACTIVE",
          roles: ["user"],
        },
      });
    }

    this.logger.log(`Apple OAuth login: ${user.id}`);
    return this.generateAuthResponse(user);
  }

  /**
   * Generate a JWT token for a user.
   */
  generateToken(userId: string, email: string): string {
    const payload: JwtPayload = {
      sub: userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      // exp removed - let JwtService handle expiration via signOptions
    };
    return this.jwtService.sign(payload);
  }

  /**
   * Verify and decode a token.
   */
  verifyToken(token: string): JwtPayload | null {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }

  /**
   * Generate a 5-digit verification code.
   */
  private generateVerificationCode(): string {
    return String(Math.floor(Math.random() * 100000)).padStart(5, "0");
  }

  /**
   * Generate auth response with token.
   */
  private generateAuthResponse(user: {
    id: string;
    email: string;
    name: string | null;
  }): AuthTokenResponseDto {
    const token = this.generateToken(user.id, user.email);
    return {
      token,
      userId: user.id,
      email: user.email,
      name: user.name,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    };
  }

  private async deleteDemoUserData(email: string): Promise<void> {
    const demoUserEmail = this.configService.get<string>("DEMO_USER_EMAIL");
    if (email !== demoUserEmail) {
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    // delete memorials, fundraising programs, posts
    await this.prisma.fundraisingProgram.deleteMany({
      where: {
        memorial: {
          ownerUserId: user.id,
        },
      },
    });
    await this.prisma.memorial.deleteMany({ where: { ownerUserId: user.id } });
    await this.prisma.post.deleteMany({ where: { creatorId: user.id } });

    // Finally, delete the user
    await this.prisma.user.delete({ where: { id: user.id } });

    this.logger.log(`Deleted demo user and related data for ${email}`);
  }
}
