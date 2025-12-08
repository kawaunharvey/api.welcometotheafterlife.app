import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SessionAnswerDto {
  @IsNotEmpty()
  @IsString()
  sessionQuestionId: string;

  @IsNotEmpty()
  value: unknown;

  @IsOptional()
  @IsString()
  textValue?: string;
}
