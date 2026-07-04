import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class SendMessageDto {
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 4000, {
    message: 'Сообщение должно быть от 1 до 4000 символов',
  })
  text!: string;
}
