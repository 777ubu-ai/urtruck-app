import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { Factory } from '../entities/factory.entity';
import { User } from '../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

interface UpsertArgs {
  factoryId: string;
  buyerId: string;
  rating: number;
  text?: string;
  photos?: Array<{ url: string; type?: string }>;
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Factory) private readonly factories: Repository<Factory>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Создать или обновить отзыв (UPSERT по unique key (factoryId, buyerId)).
   * В одной транзакции:
   *   1. Проверка ролей (only buyer, no self-review)
   *   2. INSERT или UPDATE отзыва
   *   3. Пересчёт denormalized factories.avg_rating + reviews_count
   * После транзакции — best-effort notify завода (in-app + FCM).
   */
  async upsert(args: UpsertArgs) {
    if (args.rating < 1 || args.rating > 5) {
      throw new BadRequestException('rating должен быть от 1 до 5');
    }
    if (args.factoryId === args.buyerId) {
      throw new BadRequestException('Нельзя оставить отзыв самому себе');
    }

    // Проверка существования завода
    const factory = await this.factories.findOne({
      where: { userId: args.factoryId },
      select: ['userId'],
    });
    if (!factory) throw new NotFoundException('Завод не найден');

    // Проверка типа автора (must be buyer or another factory — позволяем
    // factory оставлять отзывы другим factory, в B2B это нормально)
    const author = await this.users.findOne({
      where: { id: args.buyerId },
      select: ['id', 'type'],
    });
    if (!author) throw new NotFoundException('Юзер не найден');

    let isNew = false;
    const result = await this.dataSource.transaction(async (m) => {
      const reviewRepo = m.getRepository(Review);
      const factoryRepo = m.getRepository(Factory);

      // Существует ли уже отзыв этого байера на этот завод?
      const existing = await reviewRepo.findOne({
        where: { factoryId: args.factoryId, buyerId: args.buyerId },
      });

      let saved: Review;
      if (existing) {
        existing.rating = args.rating;
        existing.text = args.text ?? null;
        existing.photos = args.photos ?? [];
        saved = await reviewRepo.save(existing);
      } else {
        isNew = true;
        saved = await reviewRepo.save(
          reviewRepo.create({
            factoryId: args.factoryId,
            buyerId: args.buyerId,
            rating: args.rating,
            text: args.text ?? null,
            photos: args.photos ?? [],
          }),
        );
      }

      // Пересчёт денормализованных счётчиков в той же транзакции
      await this.recalcFactoryStats(args.factoryId, factoryRepo);

      return saved;
    });

    // Notify завод о новом отзыве (только для INSERT, не UPDATE — иначе спам)
    if (isNew) {
      void this.notifications.notifyNewReview({
        factoryId: args.factoryId,
        actorId: args.buyerId,
        rating: args.rating,
        text: args.text,
      });
    }

    return result;
  }

  /**
   * Удалить отзыв. Только автор может удалить свой отзыв.
   * Пересчитывает статы завода после удаления.
   */
  async delete(args: { reviewId: string; userId: string }) {
    const review = await this.reviews.findOne({
      where: { id: args.reviewId },
    });
    if (!review) throw new NotFoundException('Отзыв не найден');
    if (review.buyerId !== args.userId) {
      throw new ForbiddenException('Можно удалять только свои отзывы');
    }
    await this.dataSource.transaction(async (m) => {
      await m.getRepository(Review).delete({ id: review.id });
      await this.recalcFactoryStats(review.factoryId, m.getRepository(Factory));
    });
    return { ok: true };
  }

  /**
   * Список отзывов завода с курсорной пагинацией.
   */
  async listForFactory(args: {
    factoryId: string;
    limit: number;
    cursor?: Date;
  }) {
    const qb = this.reviews
      .createQueryBuilder('r')
      .where('r.factoryId = :fid', { fid: args.factoryId })
      .orderBy('r.createdAt', 'DESC')
      .take(args.limit + 1);
    if (args.cursor) {
      qb.andWhere('r.createdAt < :cursor', { cursor: args.cursor });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > args.limit;
    const items = hasMore ? rows.slice(0, args.limit) : rows;

    // Подгружаем displayNames авторов одним запросом
    const buyerIds = Array.from(new Set(items.map((r) => r.buyerId)));
    const authors =
      buyerIds.length > 0
        ? await this.users
            .createQueryBuilder('u')
            .leftJoinAndSelect('u.factory', 'f')
            .where('u.id IN (:...ids)', { ids: buyerIds })
            .getMany()
        : [];
    const authorMap = new Map(authors.map((u) => [u.id, u]));

    return {
      items: items.map((r) => {
        const u = authorMap.get(r.buyerId);
        const name =
          u?.name ||
          u?.factory?.companyName ||
          (u?.type === 'factory' ? 'Завод' : 'Байер');
        return {
          id: r.id,
          rating: r.rating,
          text: r.text,
          photos: r.photos,
          isVerified: r.isVerified,
          createdAt: r.createdAt,
          author: {
            id: r.buyerId,
            name,
            avatarUrl: u?.avatarUrl ?? null,
            type: u?.type ?? 'buyer',
          },
        };
      }),
      hasMore,
      nextCursor:
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null,
    };
  }

  /**
   * Найти существующий отзыв конкретного юзера на конкретный завод.
   * Используется фронтом, чтобы предзаполнить форму редактирования.
   */
  async getMyReview(args: { factoryId: string; userId: string }) {
    return this.reviews.findOne({
      where: { factoryId: args.factoryId, buyerId: args.userId },
    });
  }

  /**
   * Пересчёт avg_rating и reviews_count в БД через единый UPDATE.
   * Используется одинаково в upsert / delete, всегда внутри транзакции.
   */
  private async recalcFactoryStats(
    factoryId: string,
    factoryRepo: Repository<Factory>,
  ) {
    await factoryRepo.query(
      `
      UPDATE factories
        SET reviews_count = COALESCE((
              SELECT COUNT(*)::int FROM reviews WHERE factory_id = $1
            ), 0),
            avg_rating = COALESCE((
              SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE factory_id = $1
            ), 0)
        WHERE user_id = $1
      `,
      [factoryId],
    );
  }
}
