import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MailgunService } from "../mailgun/mailgun.service";
import { NotificationService } from "./notification.service";

@Module({
  imports: [PrismaModule],
  providers: [NotificationService, MailgunService],
  exports: [NotificationService],
})
export class NotificationsModule {}
