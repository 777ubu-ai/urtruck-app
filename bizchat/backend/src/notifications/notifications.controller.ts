import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  /**
   * GET /api/v1/notifications?limit=20&cursor=2026-04-10T12:00:00Z
   *
   * Лента уведомлений текущего юзера, новые сверху, курсорная пагинация.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Req() req: RequestWithUser,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ) {
    const userId = req.user!.sub;
    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : undefined;
    const { items, hasMore } = await this.service.listForUser(userId, {
      limit,
      cursor,
    });
    return {
      data: items.map((n) => ({
        id: n.id,
        type: n.type,
        actor: {
          id: n.actorId,
          name: n.actorName,
        },
        post: n.postId
          ? {
              id: n.postId,
              title: n.postTitle,
              thumbnailUrl: n.postThumbnailUrl,
            }
          : null,
        conversationId: n.conversationId,
        preview: n.preview,
        readAt: n.readAt,
        createdAt: n.createdAt,
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
   * GET /api/v1/notifications/unread-count
   *
   * Лёгкий эндпоинт для polling — возвращает только число непрочитанных.
   * Используется для бейджа на иконке колокольчика.
   */
  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  async unreadCount(@Req() req: RequestWithUser) {
    const userId = req.user!.sub;
    const count = await this.service.getUnreadCount(userId);
    return { count };
  }

  /**
   * PATCH /api/v1/notifications/:id/read — пометить одно как прочитанное.
   */
  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async markOneRead(
    @Param('id', new ParseUUIDPipe()) notifId: string,
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user!.sub;
    await this.service.markAsRead(userId, notifId);
    return { ok: true };
  }

  /**
   * PATCH /api/v1/notifications/read-all — пометить ВСЕ непрочитанные как прочитанные.
   */
  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async markAllRead(@Req() req: RequestWithUser) {
    const userId = req.user!.sub;
    const count = await this.service.markAllAsRead(userId);
    return { markedRead: count };
  }
}
