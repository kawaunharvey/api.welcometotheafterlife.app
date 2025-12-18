import { Injectable } from "@nestjs/common";
import { FeedItemType, Statement, StatementType } from "@prisma/client";

interface RenderInput {
  type: FeedItemType;
  payload: Record<string, unknown>;
  locale?: string;
}

type SegmentKind = "TEXT" | "FIELD" | "MONEY" | "DATE" | "NUMBER";

interface BaseSegment {
  kind: SegmentKind;
  fallbackText?: string;
  sourceIdPath?: string;
  sourceIdPrefix?: string;
}

interface TextSegment extends BaseSegment {
  kind: "TEXT";
  text: string;
}

interface FieldSegment extends BaseSegment {
  kind: "FIELD";
  path: string;
}

interface MoneySegment extends BaseSegment {
  kind: "MONEY";
  amountPath: string;
  currencyPath?: string;
}

interface DateSegment extends BaseSegment {
  kind: "DATE";
  path: string;
}

interface NumberSegment extends BaseSegment {
  kind: "NUMBER";
  path: string;
}

type TemplateSegment =
  | TextSegment
  | FieldSegment
  | MoneySegment
  | DateSegment
  | NumberSegment;

interface TemplateDefinition {
  requiredPaths: string[];
  segments: TemplateSegment[];
}

@Injectable()
export class FeedTemplateService {
  private readonly defaultLocale = "en-US";

  private readonly templates: Record<FeedItemType, TemplateDefinition> = {
    [FeedItemType.DONATION]: {
      requiredPaths: [
        "donation.amountCents",
        "donation.currency",
        "target.displayName",
        "target.id",
      ],
      segments: [
        {
          kind: "FIELD",
          path: "actor.displayName",
          sourceIdPath: "actor.id",
          sourceIdPrefix: "user",
          fallbackText: "Someone",
        },
        { kind: "TEXT", text: " donated " },
        {
          kind: "MONEY",
          amountPath: "donation.amountCents",
          currencyPath: "donation.currency",
          sourceIdPath: "donation.id",
          sourceIdPrefix: "donation",
        },
        { kind: "TEXT", text: " to " },
        {
          kind: "FIELD",
          path: "target.displayName",
          sourceIdPath: "target.id",
          sourceIdPrefix: "memorial",
        },
      ],
    },
    [FeedItemType.MEMORIAL_UPDATE]: {
      requiredPaths: ["memorial.displayName", "memorial.id", "summary"],
      segments: [
        {
          kind: "FIELD",
          path: "actor.displayName",
          sourceIdPath: "actor.id",
          sourceIdPrefix: "user",
          fallbackText: "Update to",
        },
        {
          kind: "FIELD",
          path: "memorial.displayName",
          sourceIdPath: "memorial.id",
          sourceIdPrefix: "memorial",
        },
        { kind: "TEXT", text: ": " },
        { kind: "FIELD", path: "summary" },
      ],
    },
    [FeedItemType.FUNDRAISER_UPDATE]: {
      requiredPaths: ["fundraiser.displayName", "fundraiser.id", "summary"],
      segments: [
        {
          kind: "FIELD",
          path: "actor.displayName",
          sourceIdPath: "actor.id",
          sourceIdPrefix: "user",
          fallbackText: "Update to",
        },
        {
          kind: "FIELD",
          path: "fundraiser.displayName",
          sourceIdPath: "fundraiser.id",
          sourceIdPrefix: "fundraiser",
        },
        { kind: "TEXT", text: ": " },
        { kind: "FIELD", path: "summary" },
      ],
    },
    [FeedItemType.OBITUARY_UPDATE]: {
      requiredPaths: ["obituary.displayName", "obituary.id", "summary"],
      segments: [
        {
          kind: "FIELD",
          path: "actor.displayName",
          sourceIdPath: "actor.id",
          sourceIdPrefix: "user",
          fallbackText: "Update to",
        },
        {
          kind: "FIELD",
          path: "obituary.displayName",
          sourceIdPath: "obituary.id",
          sourceIdPrefix: "obituary",
        },
        { kind: "TEXT", text: ": " },
        { kind: "FIELD", path: "summary" },
      ],
    },
    [FeedItemType.EVENT_NOTICE]: {
      requiredPaths: ["event.displayName", "event.id", "event.startsAt"],
      segments: [
        {
          kind: "FIELD",
          path: "event.displayName",
          sourceIdPath: "event.id",
          sourceIdPrefix: "event",
        },
        { kind: "TEXT", text: " on " },
        { kind: "DATE", path: "event.startsAt" },
        { kind: "TEXT", text: " at " },
        { kind: "FIELD", path: "event.location", fallbackText: "online" },
      ],
    },
    [FeedItemType.AI_SUMMARY]: {
      requiredPaths: ["summary"],
      segments: [
        { kind: "TEXT", text: "Summary: " },
        { kind: "FIELD", path: "summary" },
      ],
    },
  };

  renderParts(input: RenderInput): { parts: Statement[] } {
    const locale = input.locale || this.defaultLocale;
    const template = this.templates[input.type];

    if (!template) {
      throw new Error(`No template registered for type ${input.type}`);
    }

    this.validateRequiredPaths(
      template.requiredPaths,
      input.payload,
      input.type,
    );

    const parts: Statement[] = [];

    for (const segment of template.segments) {
      const rendered = this.renderSegment(segment, input.payload, locale);
      if (!rendered) continue;

      const { text, sourceId } = rendered;
      if (!text || text.trim().length === 0) continue;

      parts.push({
        text,
        sourceId: sourceId || null,
        type: sourceId ? StatementType.RECORD : StatementType.STRING,
      });
    }

    return { parts };
  }

  private validateRequiredPaths(
    paths: string[],
    payload: Record<string, unknown>,
    type: FeedItemType,
  ) {
    const missing = paths.filter(
      (p) => this.getValue(payload, p) === undefined,
    );
    if (missing.length) {
      throw new Error(
        `Missing required fields for ${type}: ${missing.join(", ")}`,
      );
    }
  }

  private renderSegment(
    segment: TemplateSegment,
    payload: Record<string, unknown>,
    locale: string,
  ): { text: string; sourceId?: string } | null {
    switch (segment.kind) {
      case "TEXT": {
        return { text: segment.text };
      }
      case "FIELD": {
        const value = this.getValue(payload, segment.path);
        const text = this.stringifyValue(value) ?? segment.fallbackText;
        if (!text) return null;
        const sourceId = segment.sourceIdPath
          ? this.buildSourceId(
              this.getValue(payload, segment.sourceIdPath),
              segment.sourceIdPrefix,
            )
          : undefined;
        return { text, sourceId };
      }
      case "MONEY": {
        const amount = this.getValue(payload, segment.amountPath);
        if (amount === undefined || amount === null) return null;
        const currency =
          this.getValue(payload, segment.currencyPath ?? "currency") ?? "USD";
        const formatter = new Intl.NumberFormat(locale, {
          style: "currency",
          currency: String(currency),
        });
        const text = formatter.format(Number(amount) / 100);
        const sourceId = segment.sourceIdPath
          ? this.buildSourceId(
              this.getValue(payload, segment.sourceIdPath),
              segment.sourceIdPrefix,
            )
          : undefined;
        return { text, sourceId };
      }
      case "DATE": {
        const value = this.getValue(payload, segment.path);
        if (!value) return null;
        const date = new Date(String(value));
        if (Number.isNaN(date.getTime())) return null;
        const formatter = new Intl.DateTimeFormat(locale, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        const text = formatter.format(date);
        const sourceId = segment.sourceIdPath
          ? this.buildSourceId(
              this.getValue(payload, segment.sourceIdPath),
              segment.sourceIdPrefix,
            )
          : undefined;
        return { text, sourceId };
      }
      case "NUMBER": {
        const value = this.getValue(payload, segment.path);
        if (value === undefined || value === null) return null;
        const formatter = new Intl.NumberFormat(locale);
        const text = formatter.format(Number(value));
        const sourceId = segment.sourceIdPath
          ? this.buildSourceId(
              this.getValue(payload, segment.sourceIdPath),
              segment.sourceIdPrefix,
            )
          : undefined;
        return { text, sourceId };
      }
      default:
        return null;
    }
  }

  private getValue(payload: Record<string, unknown>, path?: string) {
    if (!path) return undefined;
    return path.split(".").reduce<unknown>((acc, key) => {
      if (
        acc &&
        typeof acc === "object" &&
        key in (acc as Record<string, unknown>)
      ) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, payload);
  }

  private stringifyValue(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    return undefined;
  }

  private buildSourceId(value: unknown, prefix?: string): string | undefined {
    const id = this.stringifyValue(value);
    if (!id) return undefined;
    return prefix ? `${prefix}:${id}` : id;
  }
}
