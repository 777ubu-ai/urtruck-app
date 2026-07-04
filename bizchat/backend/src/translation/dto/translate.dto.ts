import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class TranslateDto {
  @IsString()
  @Length(1, 5000, { message: 'Текст должен быть 1-5000 символов' })
  text!: string;

  @IsString()
  @Length(2, 8)
  @Matches(/^[a-z]{2}([-_][a-zA-Z]{2,4})?$/, {
    message: 'targetLang должен быть кодом локали (ru, en, zh, zh-CN, ...)',
  })
  targetLang!: string;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  sourceLang?: string;
}
