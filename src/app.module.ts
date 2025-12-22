import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { PrismaModule } from "@/prisma/prisma.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { MemorialsModule } from "@/modules/memorials/memorials.module";
import { FollowsModule } from "@/modules/follows/follows.module";
import { FeedsModule } from "@/modules/feeds/feeds.module";
import { AuditModule } from "@/modules/audit/audit.module";
import { UploadsModule } from "@/modules/uploads/uploads.module";
import { PostsModule } from "@/modules/posts/posts.module";
import { InteractionsModule } from "@/modules/interactions/interactions.module";
import { UsersModule } from "@/modules/users/users.module";
import { FundraisingModule } from "@/modules/fundraising/fundraising.module";
import { VerificationModule } from "@/modules/verification/verification.module";
import { CacheModule } from "@/common/cache/cache.module";
import { DecoratorModule } from "@/modules/decorator/decorator.module";
import { HealthController } from "./health/health.controller";
import { AppDataModule } from "./modules/app-data/app-data.module";
import { LocationsModule } from "@/modules/locations/locations.module";
import { FeedbackModule } from "@/modules/feedback/feedback.module";
import { UnderworldModule } from "@/modules/underworld/underworld.module";
import { LedgerModule } from "@/modules/ledger/ledger.module";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                target: "pino-pretty",
                options: {
                  colorize: true,
                  singleLine: true,
                  ignoreKeys: ["pid", "hostname", "req", "res", "responseTime"],
                  translateTime: "SYS:standard",
                },
              },
        level: process.env.LOG_LEVEL || "info",
        quietReqLogger: false,
        autoLogging: true,
        customSuccessMessage: (req, res) => {
          const method = req.method;
          const url = req.url;
          const statusCode = res.statusCode;
          return `${method} ${url} - ${statusCode}`;
        },
        customErrorMessage: (req, res, err) => {
          const method = req.method;
          const url = req.url;
          const statusCode = res.statusCode;
          return `${method} ${url} - ${statusCode} - ${err.message}`;
        },
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            query: req.query,
            params: req.params,
            body: req.body,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 60, // 60 requests per TTL
      },
    ]),
    PrismaModule,
    CacheModule,
    AuthModule,
    UsersModule,
    MemorialsModule,
    FollowsModule,
    FeedsModule,
    AuditModule,
    UploadsModule,
    PostsModule,
    InteractionsModule,
    FundraisingModule,
    VerificationModule,
    AppDataModule,
    LocationsModule,
    DecoratorModule,
    FeedbackModule,
    UnderworldModule,
    LedgerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
