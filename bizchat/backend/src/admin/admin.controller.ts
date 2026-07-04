import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './admin.service';

/**
 * Админ-панель: верификация заводов и разбор жалоб.
 * Все эндпоинты требуют JWT + номер телефона из белого списка ADMIN_PHONES.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // === Верификация заводов ===

  /** GET /api/v1/admin/factories/pending — заводы, ждущие верификации. */
  @Get('factories/pending')
  async pendingFactories() {
    return this.admin.pendingFactories();
  }

  /** POST /api/v1/admin/factories/:userId/verify — подтвердить верификацию. */
  @Post('factories/:userId/verify')
  @HttpCode(200)
  async verify(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.admin.verifyFactory(userId);
  }

  /** POST /api/v1/admin/factories/:userId/unverify — снять верификацию. */
  @Post('factories/:userId/unverify')
  @HttpCode(200)
  async unverify(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.admin.unverifyFactory(userId);
  }

  // === Жалобы ===

  /**
   * GET /api/v1/admin/reports?all=true — список жалоб.
   * По умолчанию только неразобранные; ?all=true — включая закрытые.
   */
  @Get('reports')
  async reports(@Query('all') all?: string) {
    return this.admin.listReports(all !== 'true');
  }

  /** POST /api/v1/admin/reports/:id/resolve — пометить жалобу разобранной. */
  @Post('reports/:id/resolve')
  @HttpCode(200)
  async resolveReport(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.resolveReport(id);
  }
}
