import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Post as PostEntity } from '../entities/post.entity';
import { PostLike } from '../entities/post-like.entity';
import { PostSave } from '../entities/post-save.entity';
import { PostComment } from '../entities/post-comment.entity';
import { Factory } from '../entities/factory.entity';
import { Follow } from '../entities/follow.entity';
import { GroupBuyOrder } from '../entities/group-buy-order.entity';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
} from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { JoinGroupBuyDto } from './dto/join-group-buy.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatGateway } from '../chat/chat.gateway';

export interface FeedQuery {
  limit?: string;
  cursor?: string; // ISO дата последнего поста из предыдущей страницы
  // 'following' — только от заводов, на которые подписан;
  // 'hot_deal' — только hot-deal посты, сортировка по discount_percent DESC
  filter?: 'all' | 'following' | 'hot_deal';
}

export interface SearchQuery {
  q?: string;
  limit?: string;
  cursor?: string;
  // Опциональные фильтры
  minPrice?: string; // в USD
  maxPrice?: string; // в USD
  maxMoq?: string;
  countryCode?: string; // 2-буквенный код страны factory
  hotDealOnly?: string; // 'true' | 'false'
}

@Controller('posts')
export class PostsController {
  constructor(
    @InjectRepository(PostEntity)
    private readonly posts: Repository<PostEntity>,
    @InjectRepository(PostLike)
    private readonly likes: Repository<PostLike>,
    @InjectRepository(PostSave)
    private readonly saves: Repository<PostSave>,
    @InjectRepository(PostComment)
    private readonly comments: Repository<PostComment>,
    @InjectRepository(Factory)
    private readonly factories: Repository<Factory>,
    @InjectRepository(Follow)
    private readonly follows: Repository<Follow>,
    @InjectRepository(GroupBuyOrder)
    private readonly groupBuyOrders: Repository<GroupBuyOrder>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly gateway: ChatGateway,
  ) {}

  /**
   * POST /api/v1/posts
   *
   * Создать новый пост. Только для заводов — buyers получают 403.
   * Бэк НЕ обрабатывает загрузку файлов здесь: фронт сначала аплоадит фото
   * через `POST /uploads/images` и получает массив URL, потом передаёт их
   * в `media` вместе с остальными полями.
   *
   * После создания инкрементируется `factories.total_products`.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createPost(
    @Body() dto: CreatePostDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;
    const userType = req.user!.type;

    if (userType !== 'factory') {
      throw new ForbiddenException(
        'Создавать посты могут только заводы. Смени тип аккаунта в профиле.',
      );
    }

    // Проверяем что factory запись существует — на случай странных состояний,
    // когда юзер зарегистрировался как factory, но запись в factories не создалась.
    const factory = await this.factories.findOne({ where: { userId } });
    if (!factory) {
      throw new NotFoundException(
        'Запись завода не найдена. Обратитесь в поддержку.',
      );
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const post = manager.create(PostEntity, {
        factoryId: userId,
        title: dto.title,
        description: dto.description ?? null,
        articleNumber: dto.articleNumber ?? null,
        hashtags: dto.hashtags ?? [],
        media: dto.media.map((m) => ({
          url: m.url,
          type: m.type,
          width: m.width,
          height: m.height,
          thumbnail: m.thumbnail,
        })),
        priceAmount: dto.priceAmount.toFixed(2), // numeric → строка
        priceCurrency: dto.priceCurrency,
        priceTiers:
          dto.priceTiers?.map((t) => ({
            quantity: t.quantity,
            price: t.price,
          })) ?? [],
        moq: dto.moq ?? 1,
        shippingDays: dto.shippingDays ?? 7,
        stockStatus: dto.stockStatus ?? 'in_stock',
      });
      const saved = await manager.save(post);

      // Обновляем счётчик товаров у завода — важно для поиска по «активным» фабрикам
      await manager.increment(
        Factory,
        { userId },
        'totalProducts',
        1,
      );

      return saved;
    });

    // Перечитываем с relations для красивого DTO с factory
    const full = await this.posts.findOne({
      where: { id: created.id },
      relations: ['factory', 'factory.user'],
    });

    return this.mapPostToDto(full!, {
      isLikedByMe: false,
      isSavedByMe: false,
    });
  }

  /**
   * GET /api/v1/posts/feed?limit=20&cursor=2026-04-10T12:00:00Z
   *
   * Хронологическая лента (сначала новые). Курсорная пагинация
   * по created_at — быстрее и надёжнее чем offset на больших объёмах.
   *
   * Эндпоинт открыт для гостей, но если пришёл валидный JWT — добавляем
   * в каждую карточку поле `isLikedByMe`, чтобы фронт мог сразу подсветить
   * сердечко. На первом спринте это просто «все посты по дате».
   * В Фазе 2/3 — алгоритм «Для тебя» (Blueprint §15).
   */
  @Get('feed')
  @UseGuards(OptionalJwtAuthGuard)
  async getFeed(@Query() query: FeedQuery, @Req() req: RequestWithUser) {
    const limit = Math.min(parseInt(query.limit || '20', 10), 50);
    const cursor = query.cursor ? new Date(query.cursor) : null;
    const currentUserId = req.user?.sub ?? null;
    const filter = query.filter || 'all';

    // Для filter=following нужен залогиненный юзер — иначе возвращаем пусто
    // (гость не может иметь подписок).
    if (filter === 'following' && !currentUserId) {
      return {
        data: [],
        meta: { limit, nextCursor: null, hasMore: false },
      };
    }

    const qb = this.posts
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.factory', 'factory')
      .leftJoinAndSelect('factory.user', 'user')
      .orderBy('post.createdAt', 'DESC')
      .limit(limit + 1); // +1 чтобы определить hasMore

    if (filter === 'following' && currentUserId) {
      // Только посты заводов, на которые подписан текущий юзер.
      // Используем sub-select вместо JOIN чтобы не дублировать строки.
      qb.andWhere(
        'post.factory_id IN (SELECT "followed_id" FROM follows WHERE "follower_id" = :currentUserId)',
        { currentUserId },
      );
    }

    if (filter === 'hot_deal') {
      // Hot deals — только посты с `is_hot_deal = true`.
      // Партиальный индекс `idx_posts_hot_deal` уже покрывает этот запрос.
      qb.andWhere('post.isHotDeal = true');
    }

    if (cursor) {
      qb.andWhere('post.createdAt < :cursor', { cursor });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    const [likedSet, savedSet, myGroupBuyMap] = await this.loadPersonalFlags(
      currentUserId,
      items,
    );

    return {
      data: items.map((p) =>
        this.mapPostToDto(p, {
          isLikedByMe: likedSet.has(p.id),
          isSavedByMe: savedSet.has(p.id),
          myGroupBuyQuantity: myGroupBuyMap.get(p.id) ?? 0,
        }),
      ),
      meta: {
        limit,
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Загружает per-user флаги для списка постов: лайки, сохранения и
   * количество в group_buy. Используется в /feed, /search, /:id.
   */
  private async loadPersonalFlags(
    currentUserId: string | null,
    items: PostEntity[],
  ): Promise<[Set<string>, Set<string>, Map<string, number>]> {
    let likedSet = new Set<string>();
    let savedSet = new Set<string>();
    const myGroupBuyMap = new Map<string, number>();

    if (currentUserId && items.length > 0) {
      const where = items.map((p) => ({
        userId: currentUserId,
        postId: p.id,
      }));
      // Группа buy есть только у постов типа group_buy — лишний запрос не делаем
      const groupBuyPostIds = items
        .filter((p) => p.type === 'group_buy')
        .map((p) => p.id);
      const [likedRows, savedRows, gbRows] = await Promise.all([
        this.likes.find({ where, select: ['postId'] }),
        this.saves.find({ where, select: ['postId'] }),
        groupBuyPostIds.length > 0
          ? this.groupBuyOrders.find({
              where: groupBuyPostIds.map((postId) => ({
                userId: currentUserId,
                postId,
              })),
              select: ['postId', 'quantity'],
            })
          : Promise.resolve([]),
      ]);
      likedSet = new Set(likedRows.map((l) => l.postId));
      savedSet = new Set(savedRows.map((s) => s.postId));
      for (const row of gbRows) {
        myGroupBuyMap.set(row.postId, row.quantity);
      }
    }

    return [likedSet, savedSet, myGroupBuyMap];
  }

  /**
   * GET /api/v1/posts/hashtag/:tag?limit=20&cursor=...
   *
   * Все посты, содержащие указанный хэштег. Точное (case-insensitive)
   * совпадение через `unnest(hashtags)`. Сортировка по `created_at DESC`,
   * курсорная пагинация.
   *
   * Альтернатива `/posts/search?q=tag` — но search ищет ещё и в title/
   * description, что не всегда нужно. Этот endpoint — **только** хэштеги.
   *
   * **ВАЖНО**: маршрут `hashtag/:tag` объявлен **до** `/:id` чтобы не
   * конфликтовать с UUID parser.
   */
  @Get('hashtag/:tag')
  @UseGuards(OptionalJwtAuthGuard)
  async getByHashtag(
    @Param('tag') tagRaw: string,
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursorRaw: string | undefined,
    @Req() req: RequestWithUser,
  ) {
    // Нормализуем: убираем ведущий # (юзер может прислать и так и эдак),
    // приводим к lowercase для case-insensitive matching.
    const tag = tagRaw.replace(/^#+/, '').toLowerCase().trim();
    if (tag.length === 0) {
      throw new BadRequestException('Хэштег не может быть пустым');
    }

    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;
    const currentUserId = req.user?.sub ?? null;

    const qb = this.posts
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.factory', 'factory')
      .leftJoinAndSelect('factory.user', 'user')
      .where(
        `EXISTS (SELECT 1 FROM unnest(post.hashtags) AS h WHERE LOWER(h) = :tag)`,
        { tag },
      )
      .orderBy('post.createdAt', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      qb.andWhere('post.createdAt < :cursor', { cursor });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    const [likedSet, savedSet, myGroupBuyMap] = await this.loadPersonalFlags(
      currentUserId,
      items,
    );

    return {
      data: items.map((p) =>
        this.mapPostToDto(p, {
          isLikedByMe: likedSet.has(p.id),
          isSavedByMe: savedSet.has(p.id),
          myGroupBuyQuantity: myGroupBuyMap.get(p.id) ?? 0,
        }),
      ),
      meta: { limit, nextCursor, hasMore, tag },
    };
  }

  /**
   * GET /api/v1/posts/reels?limit=20&cursor=...
   *
   * Только посты, в `media` которых есть хотя бы один элемент с
   * `type='video'`. Используется для full-screen vertical swipe viewer'а
   * (TikTok-style). Сортировка по `created_at DESC`.
   *
   * Под `OptionalJwtAuthGuard` — гости тоже могут смотреть. Авторизованным
   * проставляются персональные флаги (likes/saves).
   *
   * **ВАЖНО**: маршрут `reels` объявлен **до** `:id` чтобы не конфликтовать
   * с `ParseUUIDPipe`.
   */
  @Get('reels')
  @UseGuards(OptionalJwtAuthGuard)
  async getReels(
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursorRaw: string | undefined,
    @Req() req: RequestWithUser,
  ) {
    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;
    const currentUserId = req.user?.sub ?? null;

    // Фильтр: media (jsonb массив) содержит хотя бы один элемент с type='video'.
    // jsonb_path_exists с lax-режимом — самый эффективный способ для PG 12+.
    const qb = this.posts
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.factory', 'factory')
      .leftJoinAndSelect('factory.user', 'user')
      .where(
        `jsonb_path_exists(post.media, '$[*] ? (@.type == "video")')`,
      )
      .orderBy('post.createdAt', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      qb.andWhere('post.createdAt < :cursor', { cursor });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    const [likedSet, savedSet, myGroupBuyMap] = await this.loadPersonalFlags(
      currentUserId,
      items,
    );

    return {
      data: items.map((p) =>
        this.mapPostToDto(p, {
          isLikedByMe: likedSet.has(p.id),
          isSavedByMe: savedSet.has(p.id),
          myGroupBuyQuantity: myGroupBuyMap.get(p.id) ?? 0,
        }),
      ),
      meta: { limit, nextCursor, hasMore },
    };
  }

  /**
   * GET /api/v1/posts/search?q=футболки&limit=20&cursor=...
   *
   * Поиск постов. Нормализация: срезаем ведущий `#`, приводим к lowercase.
   * Ищем по трём критериям (OR):
   *   1. Точное совпадение хэштега (GIN-индекс по `hashtags`)
   *   2. `title ILIKE '%q%'`
   *   3. `description ILIKE '%q%'`
   * Курсорная пагинация по `created_at DESC` как в /feed.
   * Под `OptionalJwtAuthGuard` — для залогиненных ставим `isLikedByMe`/`isSavedByMe`.
   *
   * ВАЖНО: маршрут `search` объявлен до `:id` — иначе Nest попытается
   * парсить "search" как UUID. `ParseUUIDPipe` бы отклонил, но явный порядок надёжнее.
   */
  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  async searchPosts(
    @Query() query: SearchQuery,
    @Req() req: RequestWithUser,
  ) {
    const rawQ = (query.q ?? '').trim();
    // Срезаем ведущий # (юзер может ввести и так, и эдак) и приводим к lowercase
    // для case-insensitive сравнения с хэштегами (которые мы в БД храним
    // в оригинальном регистре, но условно — lowercase).
    const q = rawQ.replace(/^#+/, '').toLowerCase();

    if (q.length < 2) {
      // Слишком короткий запрос — отдаём пусто, фронт показывает hint.
      return {
        data: [],
        meta: { limit: 20, nextCursor: null, hasMore: false, query: q },
      };
    }

    const limit = Math.min(parseInt(query.limit || '20', 10), 50);
    const cursor = query.cursor ? new Date(query.cursor) : null;
    const currentUserId = req.user?.sub ?? null;

    // Паттерн для ILIKE — экранируем % и _ чтобы избежать SQL-wildcard инжекции
    // (не SQL-инъекция в классическом смысле, но юзер смог бы хитрить с wildcards).
    const escaped = q.replace(/[%_\\]/g, (m) => '\\' + m);
    const ilikePattern = `%${escaped}%`;

    const qb = this.posts
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.factory', 'factory')
      .leftJoinAndSelect('factory.user', 'user')
      .where(
        // 1) :q = ANY (lowered hashtags) — точный matching хэштега
        // 2) ИЛИ title/description ILIKE
        // Используем raw SQL для lower-case поиска по массиву.
        `(
          EXISTS (SELECT 1 FROM unnest(post.hashtags) AS h WHERE LOWER(h) = :q)
          OR LOWER(post.title) LIKE :ilike
          OR LOWER(COALESCE(post.description, '')) LIKE :ilike
        )`,
        { q, ilike: ilikePattern },
      )
      .orderBy('post.createdAt', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      qb.andWhere('post.createdAt < :cursor', { cursor });
    }

    // Фильтры (опциональны)
    const minPrice = query.minPrice
      ? parseFloat(query.minPrice)
      : null;
    const maxPrice = query.maxPrice
      ? parseFloat(query.maxPrice)
      : null;
    const maxMoq = query.maxMoq ? parseInt(query.maxMoq, 10) : null;
    const countryCode = query.countryCode?.toUpperCase();
    const hotDealOnly = query.hotDealOnly === 'true';

    if (minPrice != null && !Number.isNaN(minPrice)) {
      qb.andWhere('CAST(post.priceAmount AS DECIMAL) >= :minPrice', {
        minPrice,
      });
    }
    if (maxPrice != null && !Number.isNaN(maxPrice)) {
      qb.andWhere('CAST(post.priceAmount AS DECIMAL) <= :maxPrice', {
        maxPrice,
      });
    }
    if (maxMoq != null && !Number.isNaN(maxMoq)) {
      qb.andWhere('post.moq <= :maxMoq', { maxMoq });
    }
    if (countryCode && countryCode.length === 2) {
      qb.andWhere('user.countryCode = :countryCode', { countryCode });
    }
    if (hotDealOnly) {
      qb.andWhere('post.isHotDeal = TRUE');
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    const [likedSet, savedSet, myGroupBuyMap] = await this.loadPersonalFlags(
      currentUserId,
      items,
    );

    return {
      data: items.map((p) =>
        this.mapPostToDto(p, {
          isLikedByMe: likedSet.has(p.id),
          isSavedByMe: savedSet.has(p.id),
          myGroupBuyQuantity: myGroupBuyMap.get(p.id) ?? 0,
        }),
      ),
      meta: {
        limit,
        nextCursor,
        hasMore,
        query: q,
        filters: {
          minPrice,
          maxPrice,
          maxMoq,
          countryCode,
          hotDealOnly,
        },
      },
    };
  }

  /**
   * GET /api/v1/posts/:id
   *
   * Один пост со всеми деталями: вся карусель медиа, все ценовые тиры,
   * полное описание, factory с trust score. Под `OptionalJwtAuthGuard`,
   * чтобы для залогиненных юзеров приходило корректное `isLikedByMe`.
   *
   * Используется экраном «Деталь товара» во Flutter.
   */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getPost(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Req() req: RequestWithUser,
  ) {
    const post = await this.posts.findOne({
      where: { id: postId },
      relations: ['factory', 'factory.user'],
    });

    if (!post) {
      throw new NotFoundException('Пост не найден');
    }

    let isLikedByMe = false;
    let isSavedByMe = false;
    let myGroupBuyQuantity = 0;
    const currentUserId = req.user?.sub;
    if (currentUserId) {
      const [like, save, gbOrder] = await Promise.all([
        this.likes.findOne({
          where: { userId: currentUserId, postId: post.id },
        }),
        this.saves.findOne({
          where: { userId: currentUserId, postId: post.id },
        }),
        post.type === 'group_buy'
          ? this.groupBuyOrders.findOne({
              where: { userId: currentUserId, postId: post.id },
              select: ['quantity'],
            })
          : Promise.resolve(null),
      ]);
      isLikedByMe = like !== null;
      isSavedByMe = save !== null;
      myGroupBuyQuantity = gbOrder?.quantity ?? 0;
    }

    // Инкремент счётчика просмотров. Делаем атомарным UPDATE — не блокируем
    // ответ, но await'им для консистентности (одна миллисекунда). В prod
    // здесь будет фильтр «не считать просмотр самого автора поста», сейчас
    // для MVP пропускаем.
    await this.posts.increment({ id: post.id }, 'viewsCount', 1);
    post.viewsCount += 1; // освежаем локальную копию чтобы ответ содержал новый счётчик

    return this.mapPostToDto(post, {
      isLikedByMe,
      isSavedByMe,
      myGroupBuyQuantity,
    });
  }

  /**
   * Маппинг сущности Post в DTO для фронта. Один источник правды для
   * /feed и /:id, чтобы поля не разъезжались. Персональные флаги (лайк,
   * сохранение, количество в group buy) передаются отдельно — их
   * вычисление выше по стеку.
   */
  private mapPostToDto(
    p: PostEntity,
    flags: {
      isLikedByMe: boolean;
      isSavedByMe: boolean;
      myGroupBuyQuantity?: number; // 0 если не участвует
    },
  ) {
    // Блок groupBuy добавляем только если пост именно group_buy — иначе null.
    const groupBuy =
      p.type === 'group_buy' && p.groupBuyTargetQuantity != null
        ? {
            targetQuantity: p.groupBuyTargetQuantity,
            currentQuantity: p.groupBuyCurrentQuantity,
            participantCount: p.groupBuyParticipantCount,
            deadline: p.groupBuyDeadline,
            unitPrice: p.groupBuyUnitPrice,
            // Цель достигнута?
            isGoalReached:
              p.groupBuyCurrentQuantity >= p.groupBuyTargetQuantity,
            // Активна ли закупка? (не истёк deadline и цель не достигнута)
            isActive:
              (p.groupBuyDeadline == null ||
                p.groupBuyDeadline.getTime() > Date.now()) &&
              p.groupBuyCurrentQuantity < p.groupBuyTargetQuantity,
            myOrderQuantity: flags.myGroupBuyQuantity ?? 0,
          }
        : null;

    return {
      id: p.id,
      type: p.type,
      title: p.title,
      description: p.description,
      articleNumber: p.articleNumber,
      hashtags: p.hashtags,
      media: p.media,
      price: {
        amount: p.priceAmount,
        currency: p.priceCurrency,
        tiers: p.priceTiers,
      },
      moq: p.moq,
      shippingDays: p.shippingDays,
      stockStatus: p.stockStatus,
      counters: {
        likes: p.likesCount,
        comments: p.commentsCount,
        shares: p.sharesCount,
        views: p.viewsCount,
      },
      isHotDeal: p.isHotDeal,
      discountPercent: p.discountPercent,
      dealExpiresAt: p.dealExpiresAt,
      isLikedByMe: flags.isLikedByMe,
      isSavedByMe: flags.isSavedByMe,
      groupBuy,
      factory: p.factory
        ? {
            userId: p.factory.userId,
            companyName: p.factory.companyName,
            trustScore: p.factory.trustScore,
            verifiedAt: p.factory.verifiedAt,
            avatarUrl: p.factory.user?.avatarUrl ?? null,
            avgRating: parseFloat(p.factory.avgRating || '0'),
            reviewsCount: p.factory.reviewsCount ?? 0,
          }
        : null,
      createdAt: p.createdAt,
    };
  }

  /**
   * POST /api/v1/posts/:id/like
   *
   * Идемпотентно: если лайк уже стоит — возвращаем текущий счётчик без ошибки.
   * Транзакция: INSERT в post_likes + инкремент posts.likes_count атомарно,
   * чтобы счётчик никогда не разъехался с реальным количеством записей.
   */
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async likePost(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;

    const result = await this.dataSource.transaction(async (manager) => {
      // ON CONFLICT DO NOTHING — гарантирует идемпотентность.
      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(PostLike)
        .values({ userId, postId })
        .orIgnore()
        .execute();

      // raw содержит вставленные строки; если был конфликт — пусто.
      const wasInserted = (insertResult.raw as unknown[]).length > 0;

      let factoryId: string | null = null;
      if (wasInserted) {
        await manager.increment(PostEntity, { id: postId }, 'likesCount', 1);
        // Создаём уведомление в той же транзакции — атомарно с лайком.
        // Если уведомление упадёт, оно не повалит лайк (внутри try/catch).
        await this.notifications.notifyPostLike({
          postId,
          actorId: userId,
          manager,
        });
        // Нужен factoryId для WebSocket-эмита ниже
        const post = await manager.findOne(PostEntity, {
          where: { id: postId },
          select: ['id', 'factoryId'],
        });
        factoryId = post?.factoryId ?? null;
      }

      const post = await manager.findOne(PostEntity, {
        where: { id: postId },
        select: ['id', 'likesCount'],
      });

      return {
        liked: true,
        likesCount: post?.likesCount ?? 0,
        wasInserted,
        factoryId,
      };
    });

    // WebSocket emit вне транзакции (не критичен, не блокирует)
    if (result.wasInserted && result.factoryId && result.factoryId !== userId) {
      this.gateway.emitNewNotification(result.factoryId, {
        type: 'like',
        postId,
      });
    }

    return { liked: result.liked, likesCount: result.likesCount };
  }

  /**
   * DELETE /api/v1/posts/:id/like
   *
   * Идемпотентно: если лайка не было — возвращаем текущий счётчик без ошибки.
   */
  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async unlikePost(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;

    return await this.dataSource.transaction(async (manager) => {
      const deleteResult = await manager.delete(PostLike, { userId, postId });
      const wasDeleted = (deleteResult.affected ?? 0) > 0;

      if (wasDeleted) {
        await manager.decrement(PostEntity, { id: postId }, 'likesCount', 1);
      }

      const post = await manager.findOne(PostEntity, {
        where: { id: postId },
        select: ['id', 'likesCount'],
      });

      return {
        liked: false,
        likesCount: post?.likesCount ?? 0,
      };
    });
  }

  /**
   * DELETE /api/v1/posts/:id
   *
   * Удалить свой пост. Только владелец-завод может удалить. CASCADE на FK
   * автоматически чистит post_likes, post_saves, post_comments. После —
   * декремент `factories.total_products`.
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deletePost(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;

    const post = await this.posts.findOne({
      where: { id: postId },
      select: ['id', 'factoryId'],
    });
    if (!post) {
      throw new NotFoundException('Пост не найден');
    }
    if (post.factoryId !== userId) {
      throw new ForbiddenException('Можно удалять только свои посты');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PostEntity, { id: postId });
      // Декремент только если запись завода ещё существует — на всякий случай.
      const factory = await manager.findOne(Factory, {
        where: { userId },
        select: ['userId', 'totalProducts'],
      });
      if (factory && factory.totalProducts > 0) {
        await manager.decrement(
          Factory,
          { userId },
          'totalProducts',
          1,
        );
      }
    });
    // 204 No Content — Nest сам не пишет тело при @HttpCode(204)
  }

  /**
   * POST /api/v1/posts/:id/share
   *
   * Инкремент счётчика `shares_count`. НЕ идемпотентно — каждый вызов
   * добавляет +1 (это аналитика «сколько раз поделились»). Не храним
   * запись о том кто именно поделился — в B2B контексте это не нужно.
   * Доступен анонимным юзерам (гостям) — они тоже могут копировать ссылку.
   */
  @Post(':id/share')
  @HttpCode(200)
  async sharePost(
    @Param('id', new ParseUUIDPipe()) postId: string,
  ) {
    const postExists = await this.posts.exists({ where: { id: postId } });
    if (!postExists) {
      throw new NotFoundException('Пост не найден');
    }
    await this.posts.increment({ id: postId }, 'sharesCount', 1);
    const fresh = await this.posts.findOne({
      where: { id: postId },
      select: ['id', 'sharesCount'],
    });
    return {
      shared: true,
      sharesCount: fresh?.sharesCount ?? 0,
    };
  }

  /**
   * POST /api/v1/posts/:id/save
   *
   * Сохранить пост в закладки. Идемпотентно: повторный POST не падает и не
   * дублирует запись (через `ON CONFLICT DO NOTHING` = `.orIgnore()`).
   *
   * Счётчик на постах не поддерживаем — сохранения приватные, общий
   * счётчик не нужен для UI.
   */
  @Post(':id/save')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async savePost(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;

    // Защита от 500 при несуществующем посте (FK бы всё равно отлегло,
    // но 404 понятнее фронту).
    const postExists = await this.posts.exists({ where: { id: postId } });
    if (!postExists) {
      throw new NotFoundException('Пост не найден');
    }

    await this.saves
      .createQueryBuilder()
      .insert()
      .into(PostSave)
      .values({ userId, postId })
      .orIgnore()
      .execute();

    return { saved: true };
  }

  /**
   * DELETE /api/v1/posts/:id/save
   *
   * Удалить пост из закладок. Идемпотентно: если сохранения не было — OK.
   */
  @Delete(':id/save')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async unsavePost(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;
    await this.saves.delete({ userId, postId });
    return { saved: false };
  }

  /**
   * POST /api/v1/posts/:id/group-buy/join
   *
   * Присоединиться к group buy или изменить свою заявку. UPSERT semantics
   * через `ON CONFLICT DO UPDATE` — один юзер = одна активная заявка.
   *
   * В транзакции:
   *   1. Upsert order row
   *   2. Пересчёт `current_quantity = SUM(quantity)` и `participant_count =
   *      COUNT(*)` для поста из всех orders
   *
   * Пересчёт дороже чем `INCREMENT +/- delta`, но проще и надёжнее —
   * не надо ловить race conditions между старой quantity и новой.
   *
   * Запреты:
   *   - Пост не group_buy → 400
   *   - Deadline уже истёк → 400
   *   - Владелец поста (завод) → 403 (нельзя участвовать в своей группе)
   */
  @Post(':id/group-buy/join')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async joinGroupBuy(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Body() dto: JoinGroupBuyDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;

    const post = await this.posts.findOne({
      where: { id: postId },
      select: [
        'id',
        'factoryId',
        'type',
        'groupBuyDeadline',
        'groupBuyTargetQuantity',
      ],
    });
    if (!post) {
      throw new NotFoundException('Пост не найден');
    }
    if (post.type !== 'group_buy') {
      throw new BadRequestException('Этот пост — не групповая закупка');
    }
    if (post.factoryId === userId) {
      throw new ForbiddenException(
        'Нельзя участвовать в своей же групповой закупке',
      );
    }
    if (
      post.groupBuyDeadline != null &&
      post.groupBuyDeadline.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Срок закупки истёк');
    }

    // Запоминаем был ли goal уже достигнут ДО апсерта — нужно для
    // detection «только что пересекли target» (was false → now true).
    const fullPost = await this.posts.findOne({
      where: { id: postId },
      select: ['groupBuyCurrentQuantity', 'title'],
    });
    const previouslyReached =
      (fullPost?.groupBuyCurrentQuantity ?? 0) >=
      (post.groupBuyTargetQuantity ?? 0);

    const result = await this.dataSource.transaction(async (manager) => {
      // UPSERT через query builder
      await manager
        .createQueryBuilder()
        .insert()
        .into(GroupBuyOrder)
        .values({ postId, userId, quantity: dto.quantity })
        .orUpdate(['quantity', 'updated_at'], ['post_id', 'user_id'])
        .execute();

      // Пересчёт счётчиков SUM/COUNT одним запросом
      const aggregate = await manager
        .createQueryBuilder(GroupBuyOrder, 'o')
        .select('COALESCE(SUM(o.quantity), 0)', 'total')
        .addSelect('COUNT(*)', 'participants')
        .where('o.post_id = :postId', { postId })
        .getRawOne<{ total: string; participants: string }>();

      const total = parseInt(aggregate?.total ?? '0', 10);
      const participants = parseInt(aggregate?.participants ?? '0', 10);

      await manager.update(
        PostEntity,
        { id: postId },
        {
          groupBuyCurrentQuantity: total,
          groupBuyParticipantCount: participants,
        },
      );

      return {
        joined: true,
        myQuantity: dto.quantity,
        currentQuantity: total,
        participantCount: participants,
        isGoalReached: total >= (post.groupBuyTargetQuantity ?? 0),
      };
    });

    // Detection «только что пересекли target» — отправляем broadcast
    // notification всем участникам + factory. Делаем после транзакции,
    // best-effort: не блокируем и не ломаем основной flow.
    if (!previouslyReached && result.isGoalReached) {
      try {
        const orders = await this.groupBuyOrders.find({
          where: { postId },
          select: ['userId'],
        });
        const participantIds = orders.map((o) => o.userId);
        // ignore: void чтобы не ждать
        void this.notifications.notifyGroupBuyCompleted({
          postId,
          postTitle: fullPost?.title ?? 'Закупка',
          factoryId: post.factoryId,
          participantIds,
          targetQuantity: post.groupBuyTargetQuantity ?? 0,
        });
      } catch {
        // best-effort
      }
    }

    return result;
  }

  /**
   * DELETE /api/v1/posts/:id/group-buy/join
   *
   * Отменить свою заявку в group buy. Идемпотентно — если заявки не было,
   * просто возвращаем текущее состояние.
   */
  @Delete(':id/group-buy/join')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async leaveGroupBuy(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;

    const post = await this.posts.findOne({
      where: { id: postId },
      select: ['id', 'type', 'groupBuyTargetQuantity'],
    });
    if (!post) {
      throw new NotFoundException('Пост не найден');
    }
    if (post.type !== 'group_buy') {
      throw new BadRequestException('Этот пост — не групповая закупка');
    }

    return await this.dataSource.transaction(async (manager) => {
      await manager.delete(GroupBuyOrder, { postId, userId });
      // Пересчёт
      const aggregate = await manager
        .createQueryBuilder(GroupBuyOrder, 'o')
        .select('COALESCE(SUM(o.quantity), 0)', 'total')
        .addSelect('COUNT(*)', 'participants')
        .where('o.post_id = :postId', { postId })
        .getRawOne<{ total: string; participants: string }>();

      const total = parseInt(aggregate?.total ?? '0', 10);
      const participants = parseInt(aggregate?.participants ?? '0', 10);

      await manager.update(
        PostEntity,
        { id: postId },
        {
          groupBuyCurrentQuantity: total,
          groupBuyParticipantCount: participants,
        },
      );

      return {
        joined: false,
        myQuantity: 0,
        currentQuantity: total,
        participantCount: participants,
        isGoalReached: total >= (post.groupBuyTargetQuantity ?? 0),
      };
    });
  }

  /**
   * GET /api/v1/posts/:id/comments?limit=20&cursor=2026-04-10T12:00:00Z
   *
   * Список комментариев одного поста, новые сверху. Курсорная пагинация
   * по `created_at` (как лента, но с `<` курсором т.к. сортировка DESC).
   * Открыт для гостей — комменты публичные. Не требует guard'а вообще.
   */
  @Get(':id/comments')
  async getComments(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ) {
    // Сначала проверяем, что пост вообще существует — иначе фронт получит
    // пустой массив и не поймёт, что URL битый.
    const postExists = await this.posts.exists({ where: { id: postId } });
    if (!postExists) {
      throw new NotFoundException('Пост не найден');
    }

    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;

    const rows = await this.comments.find({
      where: {
        postId,
        ...(cursor ? { createdAt: LessThan(cursor) } : {}),
      },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: limit + 1, // +1 чтобы определить hasMore
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    return {
      data: items.map((c) => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt,
        user: {
          id: c.user.id,
          name: c.user.name,
          avatarUrl: c.user.avatarUrl,
          type: c.user.type,
        },
      })),
      meta: {
        limit,
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * POST /api/v1/posts/:id/comments
   *
   * Создать комментарий. В транзакции: INSERT в post_comments + инкремент
   * posts.comments_count, чтобы счётчик никогда не разъехался.
   */
  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async createComment(
    @Param('id', new ParseUUIDPipe()) postId: string,
    @Body() dto: CreateCommentDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;

    // Проверяем, что пост существует — без этого FK даст 500, а нам нужен 404.
    const postExists = await this.posts.exists({ where: { id: postId } });
    if (!postExists) {
      throw new NotFoundException('Пост не найден');
    }

    const { created, factoryId } = await this.dataSource.transaction(
      async (manager) => {
        const comment = manager.create(PostComment, {
          postId,
          userId,
          text: dto.text,
        });
        const saved = await manager.save(comment);
        await manager.increment(
          PostEntity,
          { id: postId },
          'commentsCount',
          1,
        );
        // Уведомление владельцу поста (если это не он сам коммент пишет)
        await this.notifications.notifyPostComment({
          postId,
          actorId: userId,
          text: dto.text,
          manager,
        });
        const post = await manager.findOne(PostEntity, {
          where: { id: postId },
          select: ['id', 'factoryId'],
        });
        return { created: saved, factoryId: post?.factoryId ?? null };
      },
    );

    // WS broadcast уведомления вне транзакции
    if (factoryId && factoryId !== userId) {
      this.gateway.emitNewNotification(factoryId, {
        type: 'comment',
        postId,
      });
    }

    // Догружаем юзера для DTO — отдельный запрос, не блокирующий транзакцию.
    const fresh = await this.comments.findOne({
      where: { id: created.id },
      relations: ['user'],
    });

    return {
      id: fresh!.id,
      text: fresh!.text,
      createdAt: fresh!.createdAt,
      user: {
        id: fresh!.user.id,
        name: fresh!.user.name,
        avatarUrl: fresh!.user.avatarUrl,
        type: fresh!.user.type,
      },
    };
  }
}
