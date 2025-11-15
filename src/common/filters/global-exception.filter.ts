import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let error = "INTERNAL_ERROR";

    // Handle Prisma errors
    if (exception instanceof PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        message = "Unique constraint violation";
        error = "CONFLICT";
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        message = "Record not found";
        error = "NOT_FOUND";
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = "Database error";
        error = "DATABASE_ERROR";
      }
      this.logger.error(
        `Prisma Error: ${exception.code} - ${exception.message}`,
      );
    }
    // Handle NestJS HTTP exceptions
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === "object") {
        const respObj = exceptionResponse as Record<string, unknown>;
        message = (respObj.message as string) || exception.message;
      } else {
        message = exceptionResponse as string;
      }
    } else {
      this.logger.error("Unhandled exception:", exception);
      message = "Internal server error";
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
