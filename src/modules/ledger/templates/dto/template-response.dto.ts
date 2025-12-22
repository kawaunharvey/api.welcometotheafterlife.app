import type {
  ActionDefinition,
  TemplateDefinition,
} from "../action-definitions";

export interface TemplateSuggestionDto {
  template: TemplateDefinition;
  actions: ActionPreviewDto[];
}

export interface ActionPreviewDto {
  type: string;
  title: string;
  description?: string;
  expectedAttachments: {
    type: string;
    slotKey: string;
    required: boolean;
    description?: string;
  }[];
}

export interface AppliedTemplateResultDto {
  ledgerId: string;
  actionsCreated: number;
  actions: {
    id: string;
    title: string;
    type: string;
    attachmentSlotsCreated: number;
  }[];
}
