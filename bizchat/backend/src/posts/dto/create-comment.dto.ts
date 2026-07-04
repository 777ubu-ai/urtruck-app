import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCommentDto {
  /**
   * Текст комментария. Максимум 2000 символов (как у Instagram).
   * Trim'им пробелы по краям, чтобы юзер не отправил «     » как валидный коммент.
   */
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 2000, {
    message: 'Комментарий должен быть от 1 до 2000 символов',
  })
  text!: string;
}
