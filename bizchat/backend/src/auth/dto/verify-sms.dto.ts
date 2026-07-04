import {
  IsIn,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import type { UserType } from '../../entities/user.entity';

export class VerifySmsDto {
  @IsString()
  @IsPhoneNumber(undefined, {
    message: 'phone должен быть в международном формате (+79991234567)',
  })
  phone!: string;

  @IsString()
  @Length(4, 8)
  @Matches(/^\d+$/, { message: 'code должен состоять только из цифр' })
  code!: string;

  /**
   * Указывается только при ПЕРВОЙ регистрации (когда пользователя ещё нет в БД).
   * При входе существующего юзера — игнорируется (берём из записи).
   */
  @IsOptional()
  @IsIn(['buyer', 'factory'], {
    message: 'type должен быть "buyer" или "factory"',
  })
  type?: UserType;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  referralCode?: string;
}
