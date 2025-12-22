import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class ApplyTemplateDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;
}

export class ApplyCustomActionsDto {
  @IsArray()
  @IsNotEmpty()
  actionTypes: string[]; // Array of action type keys from ACTION_DEFINITIONS
}
