import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * PATCH /api/v1/users/me — частичное обновление профиля.
 * Все поля опциональны: фронт шлёт только то, что меняет.
 *
 * Email/phone/type/referral_code менять нельзя — это иммутабельные поля
 * аккаунта, для смены phone нужен отдельный flow с SMS-верификацией.
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(0, 128)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1024)
  avatarUrl?: string;

  // Язык UI: ru, en, zh, ...
  @IsOptional()
  @IsString()
  @Length(2, 8)
  @Matches(/^[a-z]{2}([-_][a-zA-Z]{2,4})?$/, {
    message: 'language должен быть кодом локали (ru, en, zh-CN, ...)',
  })
  language?: string;

  // Валюта отображения: USD, KZT, CNY, ...
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currency должна быть 3 заглавные буквы' })
  currency?: string;

  // ISO 3166-1 alpha-2: KZ, RU, CN, US, ...
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode — 2 заглавные буквы' })
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(0, 128)
  city?: string;

  // Только для заводов — название компании
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 256)
  companyName?: string;

  /**
   * Только для заводов — бизнес-лицензия (URL загруженного документа или
   * текст с реквизитами). Заполнение = заявка на верификацию, которую
   * подтверждает админ (см. AdminController). До подтверждения verifiedAt
   * остаётся null.
   */
  @IsOptional()
  @IsString()
  @Length(0, 4096)
  businessLicense?: string;

  /// «О себе» завода — многострочное описание для витрины.
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 256)
  website?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  whatsapp?: string;

  /// Физический адрес завода — этаж/ряд/секция и т.п.
  @IsOptional()
  @IsString()
  @Length(0, 1024)
  address?: string;

  /**
   * Глобальный toggle push-уведомлений. Если false — сервер не шлёт пуши,
   * но in-app notifications всё равно создаются и видны в колокольчике.
   */
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  /**
   * Гранулярные пресеты (partial merge). Фронт шлёт только изменённые
   * ключи — сервер мёржит их с текущими значениями в БД. Ключи, которых
   * нет в объекте, не трогаются.
   */
  @IsOptional()
  @IsObject()
  notificationPrefs?: Partial<{
    likes: boolean;
    comments: boolean;
    messages: boolean;
    reviews: boolean;
    groupBuy: boolean;
  }>;

  /**
   * Quiet hours — окно когда push не доставляется (сохраняется только
   * in-app notification). Формат HH:MM. null = выключено.
   * Окно может пересекать полночь (22:00 → 08:00).
   */
  @IsOptional()
  quietHoursStart?: string | null;

  @IsOptional()
  quietHoursEnd?: string | null;
}
