import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Factory } from '../entities/factory.entity';
import { Post as PostEntity } from '../entities/post.entity';
import { PostSave } from '../entities/post-save.entity';
import { Follow } from '../entities/follow.entity';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
} from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { UpdateMeDto } from './dto/update-me.dto';

@Controller('users')
export class UsersController {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Factory)
    private readonly factories: Repository<Factory>,
    @InjectRepository(PostEntity)
    private readonly posts: Repository<PostEntity>,
    @InjectRepository(PostSave)
    private readonly saves: Repository<PostSave>,
    @InjectRepository(Follow)
    private readonly follows: Repository<Follow>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * GET /api/v1/users/me
   *
   * Полный профиль текущего юзера. Для type=factory дополнительно подгружаем
   * связанную запись из `factories` (1:1) с company_name, hashtags, trust_score.
   * Используется экраном Профиля во Flutter.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: RequestWithUser) {
    const userId = req.user!.sub;

    const user = await this.users.findOne({
      where: { id: userId },
      relations: ['factory'],
    });

    if (!user) {
      // Юзера удалили, но JWT ещё действителен — на фронте это значит «выкинуть на логин»
      throw new NotFoundException('Пользователь не найден');
    }

    // Счётчики для шапки профиля (публикации / подписчики / подписки) —
    // раньше их отдавал только публичный профиль, поэтому на своём экране
    // показать их было нечем.
    const [postsCount, followersCount, followingCount] = await Promise.all([
      // Посты привязаны к заводу (factory_id = user_id владельца).
      this.posts.count({ where: { factoryId: userId } }),
      this.follows.count({ where: { followedId: userId } }),
      this.follows.count({ where: { followerId: userId } }),
    ]);

    return {
      id: user.id,
      phone: user.phone,
      type: user.type,
      countryCode: user.countryCode,
      city: user.city,
      name: user.name,
      avatarUrl: user.avatarUrl,
      language: user.language,
      currency: user.currency,
      referralCode: user.referralCode,
      bonusPoints: user.bonusPoints,
      verified: user.verified,
      pushEnabled: user.pushEnabled,
      notificationPrefs: user.notificationPrefs,
      createdAt: user.createdAt,
      postsCount,
      followersCount,
      followingCount,
      // Только для заводов — разворачиваем factory
      factory: user.factory
        ? {
            companyName: user.factory.companyName,
            description: user.factory.description,
            website: user.factory.website,
            whatsapp: user.factory.whatsapp,
            hashtags: user.factory.hashtags,
            trustScore: user.factory.trustScore,
            verifiedAt: user.factory.verifiedAt,
            // Живой счёт постов, а не счётчик factories.total_products:
            // счётчик мог разойтись с реальным списком товаров.
            totalProducts: postsCount,
            totalDeals: user.factory.totalDeals,
            avgRating: parseFloat(user.factory.avgRating || '0'),
            reviewsCount: user.factory.reviewsCount ?? 0,
          }
        : null,
    };
  }

  /**
   * PATCH /api/v1/users/me
   *
   * Частичное обновление профиля. Все поля DTO опциональны — обновляем
   * только то, что пришло.
   *
   * `companyName` для типа `factory` идёт в отдельную таблицу `factories`
   * — обновляем в той же транзакции, что и `users`.
   */
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @Body() dto: UpdateMeDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;

    await this.dataSource.transaction(async (manager) => {
      const userPatch: Partial<User> = {};
      if (dto.name !== undefined) userPatch.name = dto.name || null;
      if (dto.avatarUrl !== undefined)
        userPatch.avatarUrl = dto.avatarUrl || null;
      if (dto.language !== undefined) userPatch.language = dto.language;
      if (dto.currency !== undefined) userPatch.currency = dto.currency;
      if (dto.countryCode !== undefined)
        userPatch.countryCode = dto.countryCode || null;
      if (dto.city !== undefined) userPatch.city = dto.city || null;
      if (dto.pushEnabled !== undefined)
        userPatch.pushEnabled = dto.pushEnabled;
      if (dto.quietHoursStart !== undefined)
        userPatch.quietHoursStart = dto.quietHoursStart;
      if (dto.quietHoursEnd !== undefined)
        userPatch.quietHoursEnd = dto.quietHoursEnd;

      // notificationPrefs — partial JSON merge. Читаем текущее значение
      // и мёржим с тем, что пришло в DTO (неуказанные ключи не трогаем).
      if (dto.notificationPrefs !== undefined) {
        const current = await manager.findOne(User, {
          where: { id: userId },
          select: ['id', 'notificationPrefs'],
        });
        const merged = {
          likes: true,
          comments: true,
          messages: true,
          reviews: true,
          groupBuy: true,
          ...(current?.notificationPrefs ?? {}),
          ...dto.notificationPrefs,
        };
        userPatch.notificationPrefs = merged;
      }

      if (Object.keys(userPatch).length > 0) {
        await manager.update(User, { id: userId }, userPatch);
      }

      // companyName и businessLicense — отдельно в factories
      const factoryPatch: Partial<Factory> = {};
      if (dto.companyName !== undefined) {
        factoryPatch.companyName = dto.companyName;
      }
      if (dto.businessLicense !== undefined) {
        // Загрузка лицензии = заявка на верификацию. Разбирает админ
        // (GET /admin/factories/pending → POST .../verify).
        factoryPatch.businessLicense = dto.businessLicense;
      }
      if (dto.description !== undefined) {
        factoryPatch.description = dto.description || null;
      }
      if (dto.website !== undefined) {
        factoryPatch.website = dto.website || null;
      }
      if (dto.whatsapp !== undefined) {
        factoryPatch.whatsapp = dto.whatsapp || null;
      }
      if (Object.keys(factoryPatch).length > 0) {
        await manager.update(Factory, { userId }, factoryPatch);
      }
    });

    // Возвращаем свежий профиль
    const fresh = await this.users.findOne({
      where: { id: userId },
      relations: ['factory'],
    });
    if (!fresh) {
      throw new NotFoundException('Пользователь не найден');
    }
    // Счётчики отдаём и здесь: экран редактирования профиля подставляет ответ
    // PATCH прямо в состояние профиля, и без них шапка обнулялась.
    const [postsCount, followersCount, followingCount] = await Promise.all([
      this.posts.count({ where: { factoryId: userId } }),
      this.follows.count({ where: { followedId: userId } }),
      this.follows.count({ where: { followerId: userId } }),
    ]);
    return {
      id: fresh.id,
      phone: fresh.phone,
      type: fresh.type,
      countryCode: fresh.countryCode,
      city: fresh.city,
      name: fresh.name,
      avatarUrl: fresh.avatarUrl,
      language: fresh.language,
      currency: fresh.currency,
      referralCode: fresh.referralCode,
      bonusPoints: fresh.bonusPoints,
      verified: fresh.verified,
      pushEnabled: fresh.pushEnabled,
      notificationPrefs: fresh.notificationPrefs,
      quietHoursStart: fresh.quietHoursStart,
      quietHoursEnd: fresh.quietHoursEnd,
      createdAt: fresh.createdAt,
      postsCount,
      followersCount,
      followingCount,
      factory: fresh.factory
        ? {
            companyName: fresh.factory.companyName,
            description: fresh.factory.description,
            website: fresh.factory.website,
            whatsapp: fresh.factory.whatsapp,
            hashtags: fresh.factory.hashtags,
            trustScore: fresh.factory.trustScore,
            verifiedAt: fresh.factory.verifiedAt,
            totalProducts: postsCount,
            totalDeals: fresh.factory.totalDeals,
            avgRating: parseFloat(fresh.factory.avgRating || '0'),
            reviewsCount: fresh.factory.reviewsCount ?? 0,
          }
        : null,
    };
  }

  /**
   * GET /api/v1/users/:id
   *
   * Публичный профиль юзера (обычно — завода). Включает счётчики подписчиков/
   * подписок и, если запрос авторизован, флаг `isFollowing` (подписан ли
   * текущий юзер на этого). Под `OptionalJwtAuthGuard`, чтобы гости тоже
   * могли смотреть профили заводов.
   */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getPublicProfile(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Req() req: RequestWithUser,
  ) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: ['factory'],
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Счётчики подписок + флаг подписки текущего юзера — параллельно
    const currentUserId = req.user?.sub;
    const [postsCount, followersCount, followingCount, myFollow] =
      await Promise.all([
        // Тот же фильтр, что и в GET /users/:id/posts — иначе число в шапке
        // не совпадёт с сеткой товаров.
        this.posts.count({ where: { factoryId: userId } }),
        this.follows.count({ where: { followedId: userId } }),
        this.follows.count({ where: { followerId: userId } }),
        currentUserId && currentUserId !== userId
          ? this.follows.findOne({
              where: { followerId: currentUserId, followedId: userId },
            })
          : Promise.resolve(null),
      ]);

    return {
      id: user.id,
      type: user.type,
      name: user.name,
      avatarUrl: user.avatarUrl,
      countryCode: user.countryCode,
      city: user.city,
      createdAt: user.createdAt,
      factory: user.factory
        ? {
            companyName: user.factory.companyName,
            description: user.factory.description,
            website: user.factory.website,
            whatsapp: user.factory.whatsapp,
            hashtags: user.factory.hashtags,
            trustScore: user.factory.trustScore,
            verifiedAt: user.factory.verifiedAt,
            // Считаем товары живым запросом, а не счётчиком factories.
            // Счётчик мог разойтись с реальным списком постов, и в профиле
            // получалось «2 товара», а в сетке — другое количество.
            totalProducts: postsCount,
            totalDeals: user.factory.totalDeals,
            avgRating: parseFloat(user.factory.avgRating || '0'),
            reviewsCount: user.factory.reviewsCount ?? 0,
          }
        : null,
      postsCount,
      followersCount,
      followingCount,
      isFollowing: myFollow !== null,
      isMe: currentUserId === userId,
    };
  }

  /**
   * GET /api/v1/users/:id/followers?limit=20&cursor=...
   *
   * Список юзеров, подписанных на этого юзера. Курсорная пагинация по
   * `follows.created_at DESC` (последние подписавшиеся сверху).
   * Открытый endpoint — гости тоже могут смотреть.
   */
  @Get(':id/followers')
  async listFollowers(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ) {
    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;

    const qb = this.follows
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.follower', 'u')
      .leftJoinAndSelect('u.factory', 'factory')
      .where('f.followedId = :userId', { userId })
      .orderBy('f.createdAt', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      qb.andWhere('f.createdAt < :cursor', { cursor });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    return {
      data: items.map((f) => ({
        id: f.follower.id,
        type: f.follower.type,
        name: f.follower.name,
        avatarUrl: f.follower.avatarUrl,
        companyName: f.follower.factory?.companyName ?? null,
        followedAt: f.createdAt,
      })),
      meta: { limit, nextCursor, hasMore },
    };
  }

  /**
   * GET /api/v1/users/:id/following?limit=20&cursor=...
   *
   * Список юзеров, на которых подписан этот юзер.
   */
  @Get(':id/following')
  async listFollowing(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ) {
    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;

    const qb = this.follows
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.followed', 'u')
      .leftJoinAndSelect('u.factory', 'factory')
      .where('f.followerId = :userId', { userId })
      .orderBy('f.createdAt', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      qb.andWhere('f.createdAt < :cursor', { cursor });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    return {
      data: items.map((f) => ({
        id: f.followed.id,
        type: f.followed.type,
        name: f.followed.name,
        avatarUrl: f.followed.avatarUrl,
        companyName: f.followed.factory?.companyName ?? null,
        followedAt: f.createdAt,
      })),
      meta: { limit, nextCursor, hasMore },
    };
  }

  /**
   * GET /api/v1/users/:id/posts?limit=20&cursor=...
   *
   * Посты конкретного юзера (обычно — завода). Используется на публичном
   * профиле для grid'а постов. Сортировка по `created_at DESC`, курсорная
   * пагинация по той же метрике.
   *
   * Открытый endpoint — гости тоже могут видеть посты завода.
   */
  @Get(':id/posts')
  async listUserPosts(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ) {
    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;

    const qb = this.posts
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.factory', 'factory')
      .leftJoinAndSelect('factory.user', 'user')
      .where('post.factory_id = :userId', { userId })
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

    return {
      data: items.map((p) => ({
        id: p.id,
        title: p.title,
        media: p.media,
        priceAmount: p.priceAmount,
        priceCurrency: p.priceCurrency,
        likesCount: p.likesCount,
        commentsCount: p.commentsCount,
        viewsCount: p.viewsCount,
        isHotDeal: p.isHotDeal,
        type: p.type,
        createdAt: p.createdAt,
      })),
      meta: { limit, nextCursor, hasMore },
    };
  }

  /**
   * POST /api/v1/users/:id/follow
   *
   * Подписаться на юзера (обычно — на завод). Идемпотентно через
   * `ON CONFLICT DO NOTHING`. Нельзя подписаться на себя (CHECK constraint
   * и отдельная проверка для user-friendly сообщения).
   */
  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async follow(
    @Param('id', new ParseUUIDPipe()) targetId: string,
    @Req() req: RequestWithUser,
  ) {
    const myId = req.user!.sub;
    if (myId === targetId) {
      throw new BadRequestException('Нельзя подписаться на самого себя');
    }
    const target = await this.users.exists({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('Пользователь не найден');
    }
    await this.follows
      .createQueryBuilder()
      .insert()
      .into(Follow)
      .values({ followerId: myId, followedId: targetId })
      .orIgnore()
      .execute();
    return { following: true };
  }

  /**
   * DELETE /api/v1/users/:id/follow — отписаться. Идемпотентно.
   */
  @Delete(':id/follow')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async unfollow(
    @Param('id', new ParseUUIDPipe()) targetId: string,
    @Req() req: RequestWithUser,
  ) {
    const myId = req.user!.sub;
    await this.follows.delete({ followerId: myId, followedId: targetId });
    return { following: false };
  }

  /**
   * GET /api/v1/users/me/saves?limit=20&cursor=...
   *
   * Список постов, сохранённых текущим юзером (закладки). Сортировка по
   * `post_saves.created_at DESC` — последние сохранённые сверху. Курсорная
   * пагинация. Возвращает данные постов в формате /feed (сразу с factory,
   * с проставленным `isSavedByMe: true` и актуальным `isLikedByMe`).
   */
  @Get('me/saves')
  @UseGuards(JwtAuthGuard)
  async mySaves(
    @Req() req: RequestWithUser,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ) {
    const userId = req.user!.sub;
    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;

    const qb = this.saves
      .createQueryBuilder('save')
      .innerJoinAndSelect('save.post', 'post')
      .leftJoinAndSelect('post.factory', 'factory')
      .leftJoinAndSelect('factory.user', 'user')
      .where('save.userId = :userId', { userId })
      .orderBy('save.createdAt', 'DESC')
      .limit(limit + 1);

    if (cursor) {
      qb.andWhere('save.createdAt < :cursor', { cursor });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Курсор — createdAt последнего save (не post!)
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    return {
      data: items.map((save) => {
        const p = save.post;
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
          isLikedByMe: false, // не загружаем для саvs-листа, можно отдельным запросом если нужно
          isSavedByMe: true, // по определению
          factory: p.factory
            ? {
                userId: p.factory.userId,
                companyName: p.factory.companyName,
                trustScore: p.factory.trustScore,
                verifiedAt: p.factory.verifiedAt,
                avatarUrl: p.factory.user?.avatarUrl ?? null,
              }
            : null,
          createdAt: p.createdAt,
        };
      }),
      meta: { limit, nextCursor, hasMore },
    };
  }
}
