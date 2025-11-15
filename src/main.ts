import { NestFactory } from "@nestjs/core";
import { ValidationPipe, HttpStatus } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import * as express from "express";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(PinoLogger));
  const configService = app.get(ConfigService);
  const logger = app.get(PinoLogger);

  // Remove x-powered-by header for security
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  // Configure raw body parsing for webhook routes
  app.use("/webhooks", express.raw({ type: "application/json" }));

  // CORS
  const corsOrigin = configService.get<string>(
    "CORS_ORIGIN",
    "http://localhost:3000",
  );
  app.enableCors({
    origin: corsOrigin.split(",").map((o) => o.trim()),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      errorHttpStatusCode: HttpStatus.BAD_REQUEST,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle("Afterlife Service API")
    .setDescription("Memorial management and social platform API")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = configService.get<number>("PORT", 3000);
  await app.listen(port);

  logger.log(`🏛️  Afterlife Service running on http://localhost:${port}`);
  logger.log(`📚 OpenAPI docs at http://localhost:${port}/docs`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start application:", err);
  process.exit(1);
});
