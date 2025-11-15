import { Injectable } from "@nestjs/common";
import FormData from "form-data";
import Mailgun from "mailgun.js";
@Injectable()
export class MailgunService {
  // mailgun secret key
  private MAILGUN_KEY = process.env.MAILGUN_API_KEY ?? "";
  private MAILGUN_DOMAIN =
    process.env.MAILGUN_DOMAIN ?? "mail.thehereafter.tech";
  private client = new Mailgun(FormData).client({
    username: "api",
    key: this.MAILGUN_KEY!,
  });
  /**
   * Send via API
   *
   * @param data
   */
  async sendMail(data) {
    await this.client.messages.create(this.MAILGUN_DOMAIN, data);
  }
}
