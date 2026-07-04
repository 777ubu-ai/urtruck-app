import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Один ценовой тир: от N штук — цена P за штуку.
 */
export class PriceTierDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;
}

/**
 * Один слайд медиа-карусели.
 */
export class MediaItemDto {
  // Обычно `/uploads/uuid.jpg` (относительный путь на нашем сервере)
  // или внешний URL (для внешних CDN). Оба варианта валидны.
  @IsString()
  @Length(1, 1024)
  url!: string;

  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsString()
  @Length(1, 1024)
  thumbnail?: string;
}

/**
 * Тело `POST /api/v1/posts` для создания нового поста заводом.
 */
export class CreatePostDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(3, 256, {
    message: 'Название должно быть от 3 до 256 символов',
  })
  title!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(0, 5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  articleNumber?: string;

  // Хэштеги без `#` — фронт должен срезать при отправке. Бэк не чистит,
  // т.к. мы не хотим скрытой магии «я ввёл #xyz, а сохранилось xyz».
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 32, { each: true })
  @Matches(/^[a-zA-Z0-9_\-\u0400-\u04FF]+$/, {
    each: true,
    message: 'Хэштег может содержать только буквы, цифры, _ и -',
  })
  hashtags?: string[];

  // numeric хранится в БД как строка (точность), но фронт шлёт число.
  // class-transformer конвертирует автоматически.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999.99)
  priceAmount!: number;

  // 3-буквенный код валюты: USD, EUR, CNY, KZT, RUB, ...
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currency должна быть 3 заглавные буквы' })
  priceCurrency!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PriceTierDto)
  priceTiers?: PriceTierDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  moq?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  shippingDays?: number;

  @IsOptional()
  @IsIn(['in_stock', 'pre_order', 'out_of_stock'])
  stockStatus?: 'in_stock' | 'pre_order' | 'out_of_stock';

  @IsArray()
  @ArrayMinSize(1, { message: 'Нужно хотя бы одно фото или видео' })
  @ArrayMaxSize(10, { message: 'Не больше 10 медиа' })
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media!: MediaItemDto[];
}
