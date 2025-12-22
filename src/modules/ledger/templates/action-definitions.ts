import type { LedgerAttachmentType } from "@prisma/client";

/**
 * Server-owned mapping of action types to their expected attachment slots
 * This ensures consistent behavior across all clients
 */

export interface ActionDefinition {
  type: string;
  title: string;
  description?: string;
  expectedAttachments: AttachmentSlotDefinition[];
}

export interface AttachmentSlotDefinition {
  type: LedgerAttachmentType;
  slotKey: string;
  required: boolean;
  description?: string;
}

/**
 * Predefined action definitions for templates
 */
export const ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  // Memorial service planning
  BOOK_VENUE: {
    type: "BOOK_VENUE",
    title: "Book service venue",
    description: "Find and book a venue for the memorial service",
    expectedAttachments: [
      {
        type: "UNDERWORLD_QUERY",
        slotKey: "underworld-query",
        required: true,
        description: "Search query for venues",
      },
      {
        type: "UNDERWORLD_BUSINESS_REFERENCE",
        slotKey: "selected-business",
        required: false,
        description: "Selected venue",
      },
      {
        type: "NOTE",
        slotKey: "note-preferences",
        required: false,
        description: "Venue preferences and requirements",
      },
    ],
  },

  HIRE_CATERER: {
    type: "HIRE_CATERER",
    title: "Hire catering service",
    description: "Find and hire a caterer for the memorial service",
    expectedAttachments: [
      {
        type: "UNDERWORLD_QUERY",
        slotKey: "underworld-query",
        required: true,
        description: "Search query for caterers",
      },
      {
        type: "UNDERWORLD_BUSINESS_REFERENCE",
        slotKey: "selected-business",
        required: false,
        description: "Selected caterer",
      },
      {
        type: "UNDERWORLD_SERVICE_REFERENCE",
        slotKey: "selected-service",
        required: false,
        description: "Selected catering package",
      },
      {
        type: "NOTE",
        slotKey: "note-dietary",
        required: false,
        description: "Dietary restrictions and preferences",
      },
    ],
  },

  ORDER_FLOWERS: {
    type: "ORDER_FLOWERS",
    title: "Order flowers",
    description: "Order floral arrangements for the service",
    expectedAttachments: [
      {
        type: "UNDERWORLD_QUERY",
        slotKey: "underworld-query",
        required: true,
        description: "Search query for florists",
      },
      {
        type: "UNDERWORLD_BUSINESS_REFERENCE",
        slotKey: "selected-business",
        required: false,
        description: "Selected florist",
      },
      {
        type: "NOTE",
        slotKey: "note-arrangements",
        required: false,
        description: "Flower preferences and arrangements",
      },
    ],
  },

  ARRANGE_TRANSPORTATION: {
    type: "ARRANGE_TRANSPORTATION",
    title: "Arrange transportation",
    description: "Coordinate transportation logistics",
    expectedAttachments: [
      {
        type: "UNDERWORLD_QUERY",
        slotKey: "underworld-query",
        required: true,
        description: "Search query for transportation services",
      },
      {
        type: "UNDERWORLD_BUSINESS_REFERENCE",
        slotKey: "selected-business",
        required: false,
        description: "Selected transportation provider",
      },
      {
        type: "NOTE",
        slotKey: "note-logistics",
        required: false,
        description: "Transportation details and schedule",
      },
    ],
  },

  // Fundraising actions
  CREATE_FUNDRAISER: {
    type: "CREATE_FUNDRAISER",
    title: "Set up fundraiser",
    description: "Create and configure a fundraising campaign",
    expectedAttachments: [
      {
        type: "FUNDRAISER_REFERENCE",
        slotKey: "fundraiser-ref",
        required: false,
        description: "Link to created fundraiser",
      },
      {
        type: "NOTE",
        slotKey: "note-campaign",
        required: false,
        description: "Campaign details and goals",
      },
    ],
  },

  // Memorial content actions
  PUBLISH_OBITUARY: {
    type: "PUBLISH_OBITUARY",
    title: "Publish obituary",
    description: "Write and publish the obituary",
    expectedAttachments: [
      {
        type: "MEMORIAL_REFERENCE",
        slotKey: "memorial-ref",
        required: true,
        description: "Associated memorial",
      },
      {
        type: "LINK",
        slotKey: "link-obituary",
        required: false,
        description: "Link to published obituary",
      },
      {
        type: "NOTE",
        slotKey: "note-draft",
        required: false,
        description: "Draft notes and key information",
      },
    ],
  },

  COLLECT_PHOTOS: {
    type: "COLLECT_PHOTOS",
    title: "Collect photos and memories",
    description: "Gather photos and stories from family and friends",
    expectedAttachments: [
      {
        type: "MEMORIAL_REFERENCE",
        slotKey: "memorial-ref",
        required: true,
        description: "Memorial to add photos to",
      },
      {
        type: "NOTE",
        slotKey: "note-sources",
        required: false,
        description: "Sources and contacts for photos",
      },
    ],
  },

  // Generic actions
  CONTACT_PERSON: {
    type: "CONTACT_PERSON",
    title: "Contact someone",
    description: "Reach out to a specific person",
    expectedAttachments: [
      {
        type: "NOTE",
        slotKey: "note-contact-info",
        required: true,
        description: "Contact information",
      },
      {
        type: "NOTE",
        slotKey: "note-purpose",
        required: false,
        description: "Purpose of contact",
      },
    ],
  },

  COORDINATE_WITH_FAMILY: {
    type: "COORDINATE_WITH_FAMILY",
    title: "Coordinate with family",
    description: "Discuss plans and decisions with family members",
    expectedAttachments: [
      {
        type: "NOTE",
        slotKey: "note-attendees",
        required: false,
        description: "Family members involved",
      },
      {
        type: "NOTE",
        slotKey: "note-topics",
        required: false,
        description: "Topics to discuss",
      },
    ],
  },
};

/**
 * Predefined templates - bundles of actions for common scenarios
 */
export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  actionTypes: string[]; // References to ACTION_DEFINITIONS keys
}

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: "memorial-service-full",
    name: "Full Memorial Service",
    description:
      "Complete checklist for planning a memorial service including venue, catering, flowers, and coordination",
    category: "memorial-service",
    actionTypes: [
      "BOOK_VENUE",
      "HIRE_CATERER",
      "ORDER_FLOWERS",
      "ARRANGE_TRANSPORTATION",
      "COORDINATE_WITH_FAMILY",
      "PUBLISH_OBITUARY",
      "COLLECT_PHOTOS",
    ],
  },
  {
    id: "memorial-service-basic",
    name: "Basic Memorial Service",
    description: "Essential tasks for a simple memorial service",
    category: "memorial-service",
    actionTypes: ["BOOK_VENUE", "COORDINATE_WITH_FAMILY", "PUBLISH_OBITUARY"],
  },
  {
    id: "fundraising-campaign",
    name: "Fundraising Campaign",
    description: "Set up and manage a fundraising campaign",
    category: "fundraising",
    actionTypes: [
      "CREATE_FUNDRAISER",
      "PUBLISH_OBITUARY",
      "COLLECT_PHOTOS",
      "COORDINATE_WITH_FAMILY",
    ],
  },
  {
    id: "memorial-content",
    name: "Memorial Content Creation",
    description:
      "Focus on creating and gathering content for the memorial page",
    category: "memorial",
    actionTypes: ["PUBLISH_OBITUARY", "COLLECT_PHOTOS"],
  },
];
