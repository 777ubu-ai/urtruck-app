import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RequestWithUser } from './jwt-auth.guard';
import { normalizePhone } from './phone.util';

/**
 * Guard для админских эндпоинтов. Ставится ПОСЛЕ JwtAuthGuard в цепочке
 * (`@UseGuards(JwtAuthGuard, AdminGuard)`) — тот кладёт `req.user`, а мы
 * сверяем телефон с белым списком ADMIN_PHONES.
 *
 * Админ определяется по номеру телефона (без отдельной роли в БД) — это
 * простой и достаточный механизм для одного-двух владельцев. Список задаётся
 * в .env: ADMIN_PHONES=+77001234567,+77009998877 (сравнение по цифрам).
 * Если список пуст — админ-эндпоинты закрыты для всех (fail-closed).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user) {
      throw new UnauthorizedException('Требуется авторизация');
    }
    const adminPhones = this.config.get('adminPhones', { infer: true });
    const userDigits = normalizePhone(req.user.phone);
    const isAdmin = adminPhones.some((p) => normalizePhone(p) === userDigits);
    if (!isAdmin) {
      throw new ForbiddenException('Доступ только для администратора');
    }
    return true;
  }
}
