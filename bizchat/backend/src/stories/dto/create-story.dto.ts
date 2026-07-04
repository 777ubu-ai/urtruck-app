import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateStoryDto {
  /**
   * URL медиа — или относительный (`/uploads/xxx.jpg`) после загрузки
   * через `/uploads/images`, или внешний URL.
   */
  @IsString()
  @Length(1, 1024)
  mediaUrl!: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  mediaType?: 'image' | 'video';

  @IsOptional()
  @IsString()
  @Length(1, 1024)
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(0, 500)
  caption?: string;
}
