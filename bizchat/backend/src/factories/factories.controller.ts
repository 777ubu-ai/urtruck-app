import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Factory } from '../entities/factory.entity';

/**
 * Каталог заводов — витрина поставщиков.
 *
 * До этого заводы можно было найти только случайно, через их товары в ленте:
 * отдельного списка не существовало. Для маркетплейса с тысячами китайских
 * фабрик это ключевой экран — здесь покупатель ищет поставщика напрямую.
 *
 * Эндпоинт публичный (без авторизации): каталог должен быть виден гостям,
 * это витрина, ради которой люди и приходят.
 */
@Controller('factories')
export class FactoriesController {
  constructor(
    @InjectRepository(Factory)
    private readonly factories: Repository<Factory>,
  ) {}

  /**
   * GET /api/v1/factories
   *   ?q=       — поиск по названию компании, описанию и хэштегам
   *   ?verified=true — только проверенные
   *   ?sort=trust|products|new  (по умолчанию trust)
   *   ?limit=&offset=
   *
   * Ответ: { items: [...], total, hasMore }
   */
  @Get()
  async list(
    @Query('q') q?: string,
    @Query('verified') verified?: string,
    @Query('sort') sort?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitRaw || '20', 10) || 20, 1), 50);
    const offset = Math.max(parseInt(offsetRaw || '0', 10) || 0, 0);

    const qb = this.factories
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.user', 'u');

    const search = (q || '').trim();
    if (search) {
      // Ищем по названию, описанию и хэштегам одновременно.
      qb.andWhere(
        new Brackets((w) => {
          w.where('f.companyName ILIKE :s', { s: `%${search}%` })
            .orWhere('f.description ILIKE :s', { s: `%${search}%` })
            .orWhere(':tag = ANY(f.hashtags)', {
              tag: search.replace(/^#/, ''),
            });
        }),
      );
    }

    if (verified === 'true') {
      qb.andWhere('f.verifiedAt IS NOT NULL');
    }

    switch (sort) {
      case 'products':
        qb.orderBy('f.totalProducts', 'DESC');
        break;
      case 'new':
        qb.orderBy('f.createdAt', 'DESC');
        break;
      default:
        // По умолчанию — сначала проверенные и надёжные: витрина должна
        // показывать лучших поставщиков первыми.
        qb.orderBy('f.trustScore', 'DESC').addOrderBy(
          'f.totalProducts',
          'DESC',
        );
    }

    qb.skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((f) => ({
        userId: f.userId,
        companyName: f.companyName,
        description: f.description,
        hashtags: f.hashtags ?? [],
        avatarUrl: f.user?.avatarUrl ?? null,
        countryCode: f.user?.countryCode ?? null,
        city: f.user?.city ?? null,
        trustScore: f.trustScore,
        verified: f.verifiedAt != null,
        totalProducts: f.totalProducts,
        totalDeals: f.totalDeals,
        avgRating: parseFloat(f.avgRating || '0'),
        reviewsCount: f.reviewsCount ?? 0,
        moqDefault: f.moqDefault,
        shippingDaysMin: f.shippingDaysMin,
        shippingDaysMax: f.shippingDaysMax,
      })),
      total,
      hasMore: offset + rows.length < total,
    };
  }
}
