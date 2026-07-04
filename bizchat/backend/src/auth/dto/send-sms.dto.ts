import { IsPhoneNumber, IsString } from 'class-validator';

export class SendSmsDto {
  /**
   * Телефон в международном формате E.164: +79991234567, +77001234567
   * class-validator использует libphonenumber-js для нормализации,
   * но без указания региона — требуем явный "+".
   */
  @IsString()
  @IsPhoneNumber(undefined, {
    message: 'phone должен быть в международном формате (+79991234567)',
  })
  phone!: string;
}
