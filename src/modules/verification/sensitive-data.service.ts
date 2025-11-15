import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { scrypt } from "crypto";
import { promisify } from "util";

const asyncScrypt = promisify(scrypt);

interface EncryptedData {
  encValue: string; // base64(ciphertext)
  encIv: string; // base64(iv)
  encAuthTag: string; // base64(authTag)
}

@Injectable()
export class SensitiveDataService {
  private readonly logger = new Logger(SensitiveDataService.name);

  private readonly encryptionKey: Buffer;
  private readonly algorithm: string;
  private readonly hashSalt: string;

  constructor(private configService: ConfigService) {
    // Get encryption key from environment
    const keyBase64 = this.configService.get<string>("SENSITIVE_DATA_ENC_KEY");
    if (!keyBase64) {
      throw new Error(
        "SENSITIVE_DATA_ENC_KEY environment variable is required",
      );
    }

    try {
      this.encryptionKey = Buffer.from(keyBase64, "base64");
      if (this.encryptionKey.length !== 32) {
        throw new Error("Encryption key must be 32 bytes (256 bits)");
      }
    } catch (error) {
      throw new Error(
        "Invalid SENSITIVE_DATA_ENC_KEY format. Must be base64 encoded 32-byte key",
      );
    }

    this.algorithm =
      this.configService.get<string>("SENSITIVE_DATA_ENC_ALGO") ||
      "aes-256-gcm";

    const salt = this.configService.get<string>("SENSITIVE_DATA_HASH_SALT");
    if (!salt) {
      throw new Error(
        "SENSITIVE_DATA_HASH_SALT environment variable is required",
      );
    }
    this.hashSalt = salt;
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   */
  encryptSensitiveData(plaintext: string): EncryptedData {
    try {
      const iv = crypto.randomBytes(16); // 128-bit IV for GCM

      const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        this.encryptionKey,
        iv,
      );

      const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      return {
        encValue: ciphertext.toString("base64"),
        encIv: iv.toString("base64"),
        encAuthTag: authTag.toString("base64"),
      };
    } catch (error) {
      this.logger.error("Failed to encrypt sensitive data", {
        error: error.message,
      });
      throw new Error("Encryption failed");
    }
  }

  /**
   * Decrypt sensitive data using AES-256-GCM
   */
  decryptSensitiveData(encrypted: EncryptedData): string {
    try {
      const ciphertext = Buffer.from(encrypted.encValue, "base64");
      const iv = Buffer.from(encrypted.encIv, "base64");
      const authTag = Buffer.from(encrypted.encAuthTag, "base64");

      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.encryptionKey,
        iv,
      );
      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return plaintext.toString("utf8");
    } catch (error) {
      this.logger.error("Failed to decrypt sensitive data", {
        error: error.message,
      });
      throw new Error("Decryption failed");
    }
  }

  /**
   * Create a one-way hash of sensitive data for long-term storage
   * Using scrypt which is built into Node.js crypto module
   */
  async hashSensitiveData(data: string): Promise<string> {
    try {
      const saltedData = data + this.hashSalt;
      const salt = crypto.randomBytes(16);
      const derivedKey = (await asyncScrypt(saltedData, salt, 32)) as Buffer;

      // Return salt + derived key as base64
      return `${salt.toString("base64")}:${derivedKey.toString("base64")}`;
    } catch (error) {
      this.logger.error("Failed to hash sensitive data", {
        error: error.message,
      });
      throw new Error("Hashing failed");
    }
  }

  /**
   * Verify a hash against original sensitive data
   */
  async verifySensitiveDataHash(data: string, hash: string): Promise<boolean> {
    try {
      const [saltBase64, derivedKeyBase64] = hash.split(":");
      if (!saltBase64 || !derivedKeyBase64) {
        return false;
      }

      const salt = Buffer.from(saltBase64, "base64");
      const storedKey = Buffer.from(derivedKeyBase64, "base64");

      const saltedData = data + this.hashSalt;
      const derivedKey = (await asyncScrypt(saltedData, salt, 32)) as Buffer;

      return crypto.timingSafeEqual(storedKey, derivedKey);
    } catch (error) {
      this.logger.error("Failed to verify sensitive data hash", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Extract last 4 digits from SSN for display purposes
   */
  extractSsnLast4(ssn: string): string | null {
    if (!ssn) return null;

    // Remove any non-numeric characters
    const cleanSsn = ssn.replace(/\D/g, "");

    if (cleanSsn.length !== 9) {
      throw new Error("SSN must be exactly 9 digits");
    }

    return cleanSsn.slice(-4);
  }

  /**
   * Validate SSN format (9 digits)
   */
  validateSsn(ssn: string): boolean {
    if (!ssn) return false;

    const cleanSsn = ssn.replace(/\D/g, "");
    return cleanSsn.length === 9;
  }

  /**
   * Clean and validate SSN input
   */
  cleanSsn(ssn: string): string {
    if (!ssn) return "";

    const cleanSsn = ssn.replace(/\D/g, "");

    if (cleanSsn.length !== 9) {
      throw new Error("SSN must be exactly 9 digits");
    }

    return cleanSsn;
  }

  /**
   * Securely clear sensitive data from memory
   * Note: This is best effort - JS doesn't guarantee memory clearing
   */
  clearSensitiveMemory(sensitiveString: string): void {
    // In JavaScript, strings are immutable, so we can't actually clear them
    // This is a placeholder for the concept - in production you might use
    // Buffer.allocUnsafe and fill with zeros, but even that has limitations
    this.logger.debug("Attempted to clear sensitive data from memory");
  }
}
