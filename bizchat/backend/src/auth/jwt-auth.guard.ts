import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

/**
 * Полезная нагрузка нашего access-токена. Соответствует тому, что подписывает
 * AuthService.issueTokens(): { sub, phone, type }.
 */
export interface JwtUserPayload {
  sub: string;
  phone: string;
  type: 'buyer' | 'factory';
  iat: number;
  exp: number;
}

/**
 * Дополняем Request, чтобы TypeScript видел `req.user` после прохождения guard'а.
 * Подключается через декларацию модуля (см. ниже).
 */
export interface RequestWithUser extends Request {
  user?: JwtUserPayload;
}

/**
 * Жёсткий guard: без валидного `Authorization: Bearer <jwt>` отвечаем 401.
 * Кладёт расшифрованный payload в `req.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearer(req);
    if (!token) {
      throw new UnauthorizedException('Требуется авторизация');
    }
    try {
      req.user = await this.jwt.verifyAsync<JwtUserPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Недействительный или просроченный токен');
    }
  }
}

/**
 * Мягкий guard: если токен есть и валидный — кладём payload в `req.user`,
 * если нет или невалидный — пропускаем как анонимного юзера. Используется
 * на эндпоинтах, доступных гостям, но желающих знать кто пришёл (например,
 * чтобы пометить в ленте «я лайкал этот пост»).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearer(req);
    if (!token) return true;
    try {
      req.user = await this.jwt.verifyAsync<JwtUserPayload>(token);
    } catch {
      // Невалидный токен у гостевого эндпоинта — игнорируем, юзер останется анонимным.
    }
    return true;
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}
