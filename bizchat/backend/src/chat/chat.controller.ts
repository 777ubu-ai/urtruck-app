import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import { DataSource, IsNull, LessThan, Not, Repository } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';
import { Message } from '../entities/message.entity';
import { User } from '../entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatGateway } from './chat.gateway';

/**
 * Все эндпоинты Direct-чатов. Обращение через `/api/v1/conversations` —
 * для лучшей читаемости URL (вместо `/chat/...`).
 */
@Controller('conversations')
export class ChatController {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly gateway: ChatGateway,
  ) {}

  /**
   * GET /api/v1/conversations
   *
   * Список бесед текущего юзера, отсортированных по `last_message_at DESC`.
   * Беседы без сообщений (только что созданные) — в конце по `created_at`.
   * Для каждой беседы возвращаем «другого» участника + краткий превью.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async listConversations(@Req() req: RequestWithUser) {
    const userId = req.user!.sub;

    const rows = await this.conversations
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.participantA', 'a')
      .leftJoinAndSelect('c.participantB', 'b')
      .where('c.participantAId = :uid OR c.participantBId = :uid', {
        uid: userId,
      })
      .orderBy('COALESCE(c.lastMessageAt, c.createdAt)', 'DESC')
      .getMany();

    // Считаем непрочитанные. Делаем одним запросом и группируем в Map.
    const conversationIds = rows.map((c) => c.id);
    let unreadByConversation = new Map<string, number>();
    if (conversationIds.length > 0) {
      const unreadRows: Array<{ cid: string; cnt: string }> = await this.messages
        .createQueryBuilder('m')
        .select('m.conversation_id', 'cid')
        .addSelect('COUNT(*)::int', 'cnt')
        .where('m.conversation_id IN (:...ids)', { ids: conversationIds })
        .andWhere('m.sender_id != :uid', { uid: userId })
        .andWhere('m.read_at IS NULL')
        .groupBy('m.conversation_id')
        .getRawMany();
      unreadByConversation = new Map(
        unreadRows.map((r) => [r.cid, parseInt(r.cnt as unknown as string, 10)]),
      );
    }

    return {
      data: rows.map((c) => {
        const isMeA = c.participantAId === userId;
        const other = isMeA ? c.participantB : c.participantA;
        return {
          id: c.id,
          other: {
            id: other.id,
            name: other.name,
            avatarUrl: other.avatarUrl,
            type: other.type,
          },
          lastMessage: c.lastMessageText
            ? {
                text: c.lastMessageText,
                createdAt: c.lastMessageAt,
                isMine: c.lastMessageSenderId === userId,
              }
            : null,
          unreadCount: unreadByConversation.get(c.id) ?? 0,
          createdAt: c.createdAt,
        };
      }),
    };
  }

  /**
   * POST /api/v1/conversations
   *
   * Найти существующую беседу с другим юзером или создать новую.
   * Идемпотентно: вызов с тем же `participantUserId` всегда возвращает
   * одну и ту же запись.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async findOrCreate(
    @Body() dto: CreateConversationDto,
    @Req() req: RequestWithUser,
  ) {
    const myId = req.user!.sub;
    const otherId = dto.participantUserId;

    if (myId === otherId) {
      throw new BadRequestException(
        'Нельзя создать беседу с самим собой',
      );
    }

    // Проверяем что второй юзер вообще существует — иначе FK даст 500
    const otherUser = await this.users.findOne({
      where: { id: otherId },
      select: ['id', 'name', 'avatarUrl', 'type'],
    });
    if (!otherUser) {
      throw new NotFoundException('Собеседник не найден');
    }

    // Нормализуем пару: a < b лексикографически (см. CHECK constraint в миграции)
    const [aId, bId] = myId < otherId ? [myId, otherId] : [otherId, myId];

    // Find or create
    let conv = await this.conversations.findOne({
      where: { participantAId: aId, participantBId: bId },
    });
    if (!conv) {
      conv = await this.conversations.save(
        this.conversations.create({
          participantAId: aId,
          participantBId: bId,
        }),
      );
    }

    return {
      id: conv.id,
      other: {
        id: otherUser.id,
        name: otherUser.name,
        avatarUrl: otherUser.avatarUrl,
        type: otherUser.type,
      },
      lastMessage: conv.lastMessageText
        ? {
            text: conv.lastMessageText,
            createdAt: conv.lastMessageAt,
            isMine: conv.lastMessageSenderId === myId,
          }
        : null,
      unreadCount: 0,
      createdAt: conv.createdAt,
    };
  }

  /**
   * GET /api/v1/conversations/:id/messages?limit=50&cursor=...
   *
   * Сообщения беседы. Сортировка DESC (новые сверху), курсорная пагинация
   * по `created_at`. Доступно только участникам беседы — иначе 403.
   *
   * При первом обращении (без cursor) автоматически помечаем все непрочитанные
   * сообщения собеседника как прочитанные.
   */
  @Get(':id/messages')
  @UseGuards(JwtAuthGuard)
  async getMessages(
    @Param('id', new ParseUUIDPipe()) convId: string,
    @Req() req: RequestWithUser,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ) {
    const userId = req.user!.sub;
    const conv = await this.conversations.findOne({
      where: { id: convId },
      select: ['id', 'participantAId', 'participantBId'],
    });
    if (!conv) {
      throw new NotFoundException('Беседа не найдена');
    }
    if (
      conv.participantAId !== userId &&
      conv.participantBId !== userId
    ) {
      throw new ForbiddenException('Это не ваша беседа');
    }

    const limit = Math.min(parseInt(limitRaw || '50', 10), 100);
    const cursor = cursorRaw ? new Date(cursorRaw) : null;

    const rows = await this.messages.find({
      where: {
        conversationId: convId,
        ...(cursor ? { createdAt: LessThan(cursor) } : {}),
      },
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // При первом запросе (без cursor) помечаем чужие непрочитанные как прочитанные.
    // Делаем НЕ внутри транзакции и НЕ в Promise.all — обычный fire-and-forget,
    // ошибки логируются, но не блокируют ответ.
    if (!cursor) {
      this.messages
        .update(
          {
            conversationId: convId,
            senderId: Not(userId),
            readAt: IsNull(),
          },
          { readAt: new Date() },
        )
        .catch(() => {/* read marker не критичен */});
    }

    return {
      data: items.map((m) => ({
        id: m.id,
        text: m.text,
        createdAt: m.createdAt,
        isMine: m.senderId === userId,
        readAt: m.readAt,
      })),
      meta: {
        limit,
        nextCursor:
          hasMore && items.length > 0
            ? items[items.length - 1].createdAt.toISOString()
            : null,
        hasMore,
      },
    };
  }

  /**
   * POST /api/v1/conversations/:id/messages
   *
   * Отправить сообщение. В транзакции INSERT message + UPDATE conversation.
   * `last_message_*` cache-поля в conversations поддерживаем здесь же.
   */
  @Post(':id/messages')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async sendMessage(
    @Param('id', new ParseUUIDPipe()) convId: string,
    @Body() dto: SendMessageDto,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;
    const conv = await this.conversations.findOne({
      where: { id: convId },
      select: ['id', 'participantAId', 'participantBId'],
    });
    if (!conv) {
      throw new NotFoundException('Беседа не найдена');
    }
    if (
      conv.participantAId !== userId &&
      conv.participantBId !== userId
    ) {
      throw new ForbiddenException('Это не ваша беседа');
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const msg = manager.create(Message, {
        conversationId: convId,
        senderId: userId,
        text: dto.text,
      });
      const saved = await manager.save(msg);
      await manager.update(
        Conversation,
        { id: convId },
        {
          lastMessageAt: saved.createdAt,
          lastMessageText: saved.text.substring(0, 200),
          lastMessageSenderId: userId,
        },
      );
      // Уведомление другому участнику
      const recipientId =
        conv.participantAId === userId
          ? conv.participantBId
          : conv.participantAId;
      await this.notifications.notifyMessage({
        conversationId: convId,
        recipientId,
        actorId: userId,
        text: dto.text,
        manager,
      });
      return saved;
    });

    // Определяем получателя ещё раз (вне транзакции — conv уже загружен выше)
    const recipientId =
      conv.participantAId === userId ? conv.participantBId : conv.participantAId;

    // Broadcast через WebSocket. `isMine: false` с точки зрения получателя.
    this.gateway.emitNewMessage(recipientId, {
      id: created.id,
      conversationId: convId,
      text: created.text,
      createdAt: created.createdAt,
      isMine: false,
      readAt: null,
    });
    // Также шлём отправителю — для multi-device синка (когда у юзера
    // приложение открыто в двух вкладках).
    this.gateway.emitNewMessage(userId, {
      id: created.id,
      conversationId: convId,
      text: created.text,
      createdAt: created.createdAt,
      isMine: true,
      readAt: null,
    });
    // Broadcast notification event чтобы bell badge обновился мгновенно
    this.gateway.emitNewNotification(recipientId, {
      type: 'message',
      conversationId: convId,
    });

    return {
      id: created.id,
      text: created.text,
      createdAt: created.createdAt,
      isMine: true,
      readAt: null,
    };
  }

  /**
   * PATCH /api/v1/conversations/:id/read
   *
   * Явно пометить все непрочитанные сообщения собеседника как прочитанные.
   * Используется когда фронт хочет сбросить unread-бейдж без открытия
   * полной истории сообщений.
   */
  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async markAsRead(
    @Param('id', new ParseUUIDPipe()) convId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;
    const conv = await this.conversations.findOne({
      where: { id: convId },
      select: ['id', 'participantAId', 'participantBId'],
    });
    if (!conv) {
      throw new NotFoundException('Беседа не найдена');
    }
    if (
      conv.participantAId !== userId &&
      conv.participantBId !== userId
    ) {
      throw new ForbiddenException('Это не ваша беседа');
    }

    const result = await this.messages.update(
      {
        conversationId: convId,
        senderId: Not(userId),
        readAt: IsNull(),
      },
      { readAt: new Date() },
    );
    return { markedRead: result.affected ?? 0 };
  }
}
