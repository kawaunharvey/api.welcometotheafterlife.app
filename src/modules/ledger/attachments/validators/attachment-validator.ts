import { BadRequestException } from "@nestjs/common";
import { LedgerAttachmentType } from "@prisma/client";

// Type-specific payload interfaces
export interface NoteData {
  text: string;
}

export interface LinkData {
  url: string;
  title?: string;
  description?: string;
}

export interface FundraiserReferenceData {
  fundraiserId: string;
  snapshotTitle?: string;
  snapshotGoal?: number;
}

export interface MemorialReferenceData {
  memorialId: string;
  snapshotDisplayName?: string;
}

export interface UnderworldQueryData {
  queryText: string;
  categories?: string[];
  location?: {
    lat: number;
    lng: number;
  };
  budget?: {
    min?: number;
    max?: number;
  };
  urgency?: string;
}

export interface UnderworldBusinessReferenceData {
  businessId: string;
  snapshotName?: string;
  snapshotAddress?: string;
}

export interface UnderworldServiceReferenceData {
  serviceOfferingId: string;
  businessId: string;
  snapshotTitle?: string;
  snapshotPrice?: number;
}

export class AttachmentValidator {
  /**
   * Validate attachment data based on type
   * Throws BadRequestException if validation fails
   */
  static validate(type: LedgerAttachmentType, data: unknown): void {
    // Allow null data for empty slots
    if (data === null || data === undefined) {
      return;
    }

    if (typeof data !== "object" || Array.isArray(data)) {
      throw new BadRequestException(
        "Attachment data must be an object or null",
      );
    }

    switch (type) {
      case "NOTE":
        this.validateNote(data);
        break;
      case "LINK":
        this.validateLink(data);
        break;
      case "FUNDRAISER_REFERENCE":
        this.validateFundraiserReference(data);
        break;
      case "MEMORIAL_REFERENCE":
        this.validateMemorialReference(data);
        break;
      case "UNDERWORLD_QUERY":
        this.validateUnderworldQuery(data);
        break;
      case "UNDERWORLD_BUSINESS_REFERENCE":
        this.validateUnderworldBusinessReference(data);
        break;
      case "UNDERWORLD_SERVICE_REFERENCE":
        this.validateUnderworldServiceReference(data);
        break;
      default:
        throw new BadRequestException(`Unknown attachment type: ${type}`);
    }
  }

  private static validateNote(data: unknown): asserts data is NoteData {
    const note = data as Partial<NoteData>;
    if (typeof note.text !== "string" || note.text.trim().length === 0) {
      throw new BadRequestException("Note must have a non-empty text field");
    }
  }

  private static validateLink(data: unknown): asserts data is LinkData {
    const link = data as Partial<LinkData>;
    if (typeof link.url !== "string" || link.url.trim().length === 0) {
      throw new BadRequestException("Link must have a non-empty url field");
    }

    // Basic URL validation
    try {
      new URL(link.url);
    } catch {
      throw new BadRequestException("Invalid URL format");
    }

    if (link.title !== undefined && typeof link.title !== "string") {
      throw new BadRequestException("Link title must be a string");
    }

    if (
      link.description !== undefined &&
      typeof link.description !== "string"
    ) {
      throw new BadRequestException("Link description must be a string");
    }
  }

  private static validateFundraiserReference(
    data: unknown,
  ): asserts data is FundraiserReferenceData {
    const ref = data as Partial<FundraiserReferenceData>;
    if (
      typeof ref.fundraiserId !== "string" ||
      ref.fundraiserId.trim().length === 0
    ) {
      throw new BadRequestException(
        "Fundraiser reference must have a non-empty fundraiserId field",
      );
    }

    if (
      ref.snapshotTitle !== undefined &&
      typeof ref.snapshotTitle !== "string"
    ) {
      throw new BadRequestException("snapshotTitle must be a string");
    }

    if (
      ref.snapshotGoal !== undefined &&
      typeof ref.snapshotGoal !== "number"
    ) {
      throw new BadRequestException("snapshotGoal must be a number");
    }
  }

  private static validateMemorialReference(
    data: unknown,
  ): asserts data is MemorialReferenceData {
    const ref = data as Partial<MemorialReferenceData>;
    if (
      typeof ref.memorialId !== "string" ||
      ref.memorialId.trim().length === 0
    ) {
      throw new BadRequestException(
        "Memorial reference must have a non-empty memorialId field",
      );
    }

    if (
      ref.snapshotDisplayName !== undefined &&
      typeof ref.snapshotDisplayName !== "string"
    ) {
      throw new BadRequestException("snapshotDisplayName must be a string");
    }
  }

  private static validateUnderworldQuery(
    data: unknown,
  ): asserts data is UnderworldQueryData {
    const query = data as Partial<UnderworldQueryData>;
    if (
      typeof query.queryText !== "string" ||
      query.queryText.trim().length === 0
    ) {
      throw new BadRequestException(
        "Underworld query must have a non-empty queryText field",
      );
    }

    if (query.categories !== undefined) {
      if (
        !Array.isArray(query.categories) ||
        !query.categories.every((c) => typeof c === "string")
      ) {
        throw new BadRequestException("categories must be an array of strings");
      }
    }

    if (query.location !== undefined) {
      if (
        typeof query.location !== "object" ||
        typeof query.location.lat !== "number" ||
        typeof query.location.lng !== "number"
      ) {
        throw new BadRequestException(
          "location must have lat and lng as numbers",
        );
      }
    }

    if (query.budget !== undefined) {
      if (typeof query.budget !== "object") {
        throw new BadRequestException("budget must be an object");
      }
      if (
        query.budget.min !== undefined &&
        typeof query.budget.min !== "number"
      ) {
        throw new BadRequestException("budget.min must be a number");
      }
      if (
        query.budget.max !== undefined &&
        typeof query.budget.max !== "number"
      ) {
        throw new BadRequestException("budget.max must be a number");
      }
    }

    if (query.urgency !== undefined && typeof query.urgency !== "string") {
      throw new BadRequestException("urgency must be a string");
    }
  }

  private static validateUnderworldBusinessReference(
    data: unknown,
  ): asserts data is UnderworldBusinessReferenceData {
    const ref = data as Partial<UnderworldBusinessReferenceData>;
    if (
      typeof ref.businessId !== "string" ||
      ref.businessId.trim().length === 0
    ) {
      throw new BadRequestException(
        "Underworld business reference must have a non-empty businessId field",
      );
    }

    if (
      ref.snapshotName !== undefined &&
      typeof ref.snapshotName !== "string"
    ) {
      throw new BadRequestException("snapshotName must be a string");
    }

    if (
      ref.snapshotAddress !== undefined &&
      typeof ref.snapshotAddress !== "string"
    ) {
      throw new BadRequestException("snapshotAddress must be a string");
    }
  }

  private static validateUnderworldServiceReference(
    data: unknown,
  ): asserts data is UnderworldServiceReferenceData {
    const ref = data as Partial<UnderworldServiceReferenceData>;
    if (
      typeof ref.serviceOfferingId !== "string" ||
      ref.serviceOfferingId.trim().length === 0
    ) {
      throw new BadRequestException(
        "Underworld service reference must have a non-empty serviceOfferingId field",
      );
    }

    if (
      typeof ref.businessId !== "string" ||
      ref.businessId.trim().length === 0
    ) {
      throw new BadRequestException(
        "Underworld service reference must have a non-empty businessId field",
      );
    }

    if (
      ref.snapshotTitle !== undefined &&
      typeof ref.snapshotTitle !== "string"
    ) {
      throw new BadRequestException("snapshotTitle must be a string");
    }

    if (
      ref.snapshotPrice !== undefined &&
      typeof ref.snapshotPrice !== "number"
    ) {
      throw new BadRequestException("snapshotPrice must be a number");
    }
  }

  /**
   * Determine if an attachment type is single-slot or multi-slot
   * Single-slot types have unique slot keys per action
   * Multi-slot types can have multiple instances
   */
  static isSingleSlot(type: LedgerAttachmentType): boolean {
    const singleSlotTypes: LedgerAttachmentType[] = [
      "UNDERWORLD_QUERY",
      "UNDERWORLD_BUSINESS_REFERENCE",
      "UNDERWORLD_SERVICE_REFERENCE",
    ];
    return singleSlotTypes.includes(type);
  }

  /**
   * Generate a slot key for an attachment type
   * Single-slot types use predictable keys
   * Multi-slot types use unique generated keys
   */
  static generateSlotKey(type: LedgerAttachmentType): string {
    if (this.isSingleSlot(type)) {
      // Predictable keys for single-slot types
      switch (type) {
        case "UNDERWORLD_QUERY":
          return "underworld-query";
        case "UNDERWORLD_BUSINESS_REFERENCE":
          return "selected-business";
        case "UNDERWORLD_SERVICE_REFERENCE":
          return "selected-service";
        default:
          return type.toLowerCase();
      }
    }

    // Unique keys for multi-slot types
    return `${type.toLowerCase()}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
