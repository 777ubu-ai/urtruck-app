import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';
import { Factory } from '../entities/factory.entity';
import { PushService } from '../push/push.service';

/**
 * Сервис уведомлений. Используется PostsModule и ChatModule, экспортируется
 * через NotificationsModule.
 *
 * Все методы создания принимают опциональный `manager` — это позволяет
 * вставлять уведомление **в той же транзакции**, что и триггерящее действие
 * (например, лайк + уведомление одной транзакцией).
 *
 * Если что-то падает при создании уведомления (например, не найдены
 * связанные данные), мы НЕ ломаем основной flow — логируем warning и
 * продолжаем. Уведомления — best-effort.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    @InjectRepository(Factory)
    private readonly factories: Repository<Factory>,
    private readonly push: PushService,
  ) {}

  /**
   * Получить «отображаемое имя» юзера: name → companyName (для заводов) → fallback.
   * Используем для денормализации в actor_name.
   */
  private async resolveActorName(
    userId: string,
    manager?: EntityManager,
  ): Promise<string> {
    const userRepo = manager ? manager.getRepository(User) : this.users;
    const factoryRepo = manager
      ? manager.getRepository(Factory)
      : this.factories;
    const user = await userRepo.findOne({
      where: { id: userId },
      select: ['id', 'name', 'type'],
    });
    if (!user) return 'Кто-то';
    if (user.name && user.name.length > 0) return user.name;
    if (user.type === 'factory') {
      const factory = await factoryRepo.findOne({
        where: { userId },
        select: ['userId', 'companyName'],
      });
      if (factory && factory.companyName) return factory.companyName;
    }
    return user.type === 'factory' ? 'Завод' : 'Байер';
  }

  /**
   * Уведомление при лайке поста: получатель — владелец поста.
   * Не нотифицируем, если actor сам себе лайкнул свой пост.
   */
  async notifyPostLike(args: {
    postId: string;
    actorId: string;
    manager?: EntityManager;
  }) {
    try {
      const repo = args.manager
        ? args.manager.getRepository(Notification)
        : this.notifications;
      const postRepo = args.manager
        ? args.manager.getRepository(Post)
        : this.posts;
      const post = await postRepo.findOne({
        where: { id: args.postId },
        select: ['id', 'factoryId', 'title', 'media'],
      });
      if (!post) return;
      if (post.factoryId === args.actorId) return; // нет смысла уведомлять самого себя
      const thumb = this.firstMediaUrl(post.media);
      const actorName = await this.resolveActorName(args.actorId, args.manager);
      await repo.save(
        repo.create({
          recipientId: post.factoryId,
          actorId: args.actorId,
          actorName,
          type: 'like',
          postId: post.id,
          postTitle: post.title,
          postThumbnailUrl: thumb,
        }),
      );
      // FCM push — best-effort, не ждём результата
      void this.push.sendToUser({
        userId: post.factoryId,
        title: actorName,
        body: `Лайкнул ваш товар: ${post.title}`,
        data: { type: 'like', postId: post.id },
        type: 'like',
      });
    } catch (e) {
      this.logger.warn(`notifyPostLike failed: ${(e as Error).message}`);
    }
  }

  /**
   * Уведомление при новом комментарии: получатель — владелец поста.
   * Превью — первые 200 символов текста.
   */
  async notifyPostComment(args: {
    postId: string;
    actorId: string;
    text: string;
    manager?: EntityManager;
  }) {
    try {
      const repo = args.manager
        ? args.manager.getRepository(Notification)
        : this.notifications;
      const postRepo = args.manager
        ? args.manager.getRepository(Post)
        : this.posts;
      const post = await postRepo.findOne({
        where: { id: args.postId },
        select: ['id', 'factoryId', 'title', 'media'],
      });
      if (!post) return;
      if (post.factoryId === args.actorId) return;
      const thumb = this.firstMediaUrl(post.media);
      const actorName = await this.resolveActorName(args.actorId, args.manager);
      await repo.save(
        repo.create({
          recipientId: post.factoryId,
          actorId: args.actorId,
          actorName,
          type: 'comment',
          postId: post.id,
          postTitle: post.title,
          postThumbnailUrl: thumb,
          preview: args.text.substring(0, 200),
        }),
      );
      void this.push.sendToUser({
        userId: post.factoryId,
        title: `${actorName} оставил комментарий`,
        body: args.text.substring(0, 120),
        data: { type: 'comment', postId: post.id },
        type: 'comment',
      });
    } catch (e) {
      this.logger.warn(`notifyPostComment failed: ${(e as Error).message}`);
    }
  }

  /**
   * Уведомление при новом сообщении: получатель — другой участник беседы.
   */
  async notifyMessage(args: {
    conversationId: string;
    recipientId: string;
    actorId: string;
    text: string;
    manager?: EntityManager;
  }) {
    try {
      if (args.recipientId === args.actorId) return;
      const repo = args.manager
        ? args.manager.getRepository(Notification)
        : this.notifications;
      const actorName = await this.resolveActorName(args.actorId, args.manager);
      await repo.save(
        repo.create({
          recipientId: args.recipientId,
          actorId: args.actorId,
          actorName,
          type: 'message',
          conversationId: args.conversationId,
          preview: args.text.substring(0, 200),
        }),
      );
      void this.push.sendToUser({
        userId: args.recipientId,
        title: actorName,
        body: args.text.substring(0, 120),
        data: { type: 'message', conversationId: args.conversationId },
        type: 'message',
      });
    } catch (e) {
      this.logger.warn(`notifyMessage failed: ${(e as Error).message}`);
    }
  }

  /**
   * Уведомление о завершении group buy — цель достигнута.
   * Получатели: factory (владелец) + все участники закупки.
   * Этот вызов — `bulk`: создаёт N notification'ов и шлёт N push'ей.
   * Best-effort: при провале логирует и продолжает.
   */
  async notifyGroupBuyCompleted(args: {
    postId: string;
    postTitle: string;
    factoryId: string;
    participantIds: string[];
    targetQuantity: number;
  }) {
    try {
      // Уведомляем factory
      await this.notifications.save(
        this.notifications.create({
          recipientId: args.factoryId,
          actorId: args.factoryId, // самообразный triggered by system
          actorName: 'Biz Chat',
          type: 'group_buy_completed',
          postId: args.postId,
          postTitle: args.postTitle,
          preview: `Закупка собрана! Цель ${args.targetQuantity} шт достигнута.`,
        }),
      );
      void this.push.sendToUser({
        userId: args.factoryId,
        title: '🎉 Закупка собрана!',
        body: `${args.postTitle} — достигнута цель ${args.targetQuantity} шт`,
        data: { type: 'group_buy_completed', postId: args.postId },
        type: 'group_buy_completed',
      });

      // Уведомляем всех участников (исключая factory если он там по ошибке)
      for (const buyerId of args.participantIds) {
        if (buyerId === args.factoryId) continue;
        await this.notifications.save(
          this.notifications.create({
            recipientId: buyerId,
            actorId: args.factoryId,
            actorName: 'Biz Chat',
            type: 'group_buy_completed',
            postId: args.postId,
            postTitle: args.postTitle,
            preview:
              'Закупка успешно собрана! Скоро получишь подтверждение от завода.',
          }),
        );
        void this.push.sendToUser({
          userId: buyerId,
          title: '🎉 Закупка собрана!',
          body: `${args.postTitle} — закупка успешно собрана, скоро отгрузка`,
          data: { type: 'group_buy_completed', postId: args.postId },
          type: 'group_buy_completed',
        });
      }
    } catch (e) {
      this.logger.warn(
        `notifyGroupBuyCompleted failed: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Уведомление при новом отзыве: получатель — завод, на который написан
   * отзыв. Спам-защита: вызывается только при INSERT (не при UPDATE),
   * это контролирует ReviewsService.
   */
  async notifyNewReview(args: {
    factoryId: string;
    actorId: string;
    rating: number;
    text?: string;
  }) {
    try {
      if (args.factoryId === args.actorId) return;
      const actorName = await this.resolveActorName(args.actorId);
      const stars = '★'.repeat(args.rating);
      await this.notifications.save(
        this.notifications.create({
          recipientId: args.factoryId,
          actorId: args.actorId,
          actorName,
          type: 'review',
          preview: args.text
            ? `${stars} ${args.text.substring(0, 180)}`
            : stars,
        }),
      );
      void this.push.sendToUser({
        userId: args.factoryId,
        title: `${actorName} оставил отзыв ${stars}`,
        body: args.text
          ? args.text.substring(0, 120)
          : `Оценка ${args.rating} из 5`,
        data: { type: 'review' },
        type: 'review',
      });
    } catch (e) {
      this.logger.warn(`notifyNewReview failed: ${(e as Error).message}`);
    }
  }

  // === Listing / read marking ===

  async listForUser(userId: string, opts: { limit: number; cursor?: Date }) {
    const where = opts.cursor
      ? { recipientId: userId, createdAt: { $lessThan: opts.cursor } as never }
      : { recipientId: userId };
    // TypeORM требует explicit operator import; делаем через query builder для чистоты
    const qb = this.notifications
      .createQueryBuilder('n')
      .where('n.recipientId = :uid', { uid: userId })
      .orderBy('n.createdAt', 'DESC')
      .take(opts.limit + 1);
    if (opts.cursor) {
      qb.andWhere('n.createdAt < :cursor', { cursor: opts.cursor });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > opts.limit;
    return {
      items: hasMore ? rows.slice(0, opts.limit) : rows,
      hasMore,
    };
  }

  async getUnreadCount(userId: string) {
    return this.notifications.count({
      where: { recipientId: userId, readAt: IsNull() },
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.notifications.update(
      { id: notificationId, recipientId: userId },
      { readAt: new Date() },
    );
  }

  async markAllAsRead(userId: string) {
    const result = await this.notifications.update(
      { recipientId: userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return result.affected ?? 0;
  }

  // === helpers ===

  private firstMediaUrl(media: unknown): string | null {
    if (!Array.isArray(media) || media.length === 0) return null;
    const first = media[0];
    if (typeof first === 'object' && first !== null && 'url' in first) {
      const url = (first as { url: unknown }).url;
      return typeof url === 'string' ? url : null;
    }
    return null;
  }
}
