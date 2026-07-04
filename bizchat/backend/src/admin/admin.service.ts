import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Factory } from '../entities/factory.entity';
import { Report } from '../entities/report.entity';

/**
 * Сервис админ-панели: верификация заводов и разбор жалоб.
 * Раньше эти поля (`user.verified`, `factory.verifiedAt`, `report.resolvedAt`)
 * только читались, но нигде не выставлялись — здесь появляется запись.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Factory)
    private readonly factories: Repository<Factory>,
    @InjectRepository(Report)
    private readonly reports: Repository<Report>,
  ) {}

  // === Верификация заводов ===

  /**
   * Заводы, ожидающие верификации: подали бизнес-лицензию (businessLicense
   * заполнен), но ещё не подтверждены (verifiedAt IS NULL).
   */
  async pendingFactories() {
    const list = await this.factories.find({
      where: { verifiedAt: IsNull(), businessLicense: Not(IsNull()) },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return list.map((f) => ({
      userId: f.userId,
      companyName: f.companyName,
      businessLicense: f.businessLicense,
      phone: f.user?.phone ?? null,
      countryCode: f.user?.countryCode ?? null,
      createdAt: f.createdAt,
    }));
  }

  /**
   * Подтвердить верификацию завода: factory.verifiedAt = now, user.verified = true.
   * Идемпотентно — повторный вызов просто обновит verifiedAt.
   */
  async verifyFactory(userId: string) {
    const factory = await this.factories.findOne({ where: { userId } });
    if (!factory) {
      throw new NotFoundException('Завод не найден');
    }
    const now = new Date();
    factory.verifiedAt = now;
    await this.factories.save(factory);
    await this.users.update({ id: userId }, { verified: true });
    this.logger.log(`Завод верифицирован: ${userId} (${factory.companyName})`);
    return { userId, verified: true, verifiedAt: now };
  }

  /**
   * Снять верификацию (например, при обнаружении фрода).
   */
  async unverifyFactory(userId: string) {
    const factory = await this.factories.findOne({ where: { userId } });
    if (!factory) {
      throw new NotFoundException('Завод не найден');
    }
    factory.verifiedAt = null;
    await this.factories.save(factory);
    await this.users.update({ id: userId }, { verified: false });
    this.logger.log(`Верификация снята: ${userId}`);
    return { userId, verified: false };
  }

  // === Разбор жалоб ===

  /**
   * Список жалоб. По умолчанию только неразобранные (resolvedAt IS NULL).
   */
  async listReports(onlyOpen = true) {
    const where = onlyOpen ? { resolvedAt: IsNull() } : {};
    const list = await this.reports.find({
      where,
      relations: { reporter: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return list.map((r) => ({
      id: r.id,
      reporterId: r.reporterId,
      reporterPhone: r.reporter?.phone ?? null,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      description: r.description ?? null,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt ?? null,
    }));
  }

  /**
   * Пометить жалобу разобранной (resolvedAt = now). Само действие над
   * контентом (скрыть пост/заблокировать юзера) выполняется отдельными
   * существующими эндпоинтами модерации — здесь закрываем саму жалобу.
   */
  async resolveReport(id: string) {
    const report = await this.reports.findOne({ where: { id } });
    if (!report) {
      throw new NotFoundException('Жалоба не найдена');
    }
    report.resolvedAt = new Date();
    await this.reports.save(report);
    return { id, resolvedAt: report.resolvedAt };
  }
}
