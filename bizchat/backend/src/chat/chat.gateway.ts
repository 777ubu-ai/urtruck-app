import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtUserPayload } from '../auth/jwt-auth.guard';
import { Conversation } from '../entities/conversation.entity';

/**
 * WebSocket gateway для real-time доставки сообщений чата и уведомлений.
 *
 * Используется Socket.IO, подключается на тот же HTTP-порт (3000).
 * Аутентификация через JWT: клиент передаёт токен в handshake `auth.token`.
 * При подключении юзер автоматически джойнится в комнату `user:<id>` —
 * ChatController/NotificationsService эмитят события именно в эти комнаты.
 *
 * События, которые сервер шлёт клиенту:
 *   - `message:new` — новое сообщение в беседе юзера
 *   - `notification:new` — новое уведомление юзера
 *
 * Клиент ничего не шлёт на сервер (listen-only). Отправка сообщений —
 * через REST `POST /conversations/:id/messages`, там же мы эмитим событие
 * получателю.
 *
 * CORS: socket.io по умолчанию применяет HTTP CORS, но у NestExpressApplication
 * он свой; указываем явно `cors: { origin: '*' }` (в prod надо настроить).
 */
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: false,
  },
  namespace: '/realtime',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
  ) {}

  /**
   * Helper: найти ID партнёра в conversation по userId текущего юзера.
   * Используется для call signaling — отправка offer/answer/ice партнёру.
   */
  private async getPartnerId(
    conversationId: string,
    myUserId: string,
  ): Promise<string | null> {
    const conv = await this.conversations.findOne({
      where: { id: conversationId },
      select: ['id', 'participantAId', 'participantBId'],
    });
    if (!conv) return null;
    if (conv.participantAId === myUserId) return conv.participantBId;
    if (conv.participantBId === myUserId) return conv.participantAId;
    return null; // юзер не участник
  }

  /**
   * Ретрансляция call signaling events (offer/answer/ice/hangup)
   * партнёру по conversation через комнату `user:<partnerId>`.
   */
  private async relayCallEvent(
    event: string,
    conversationId: string,
    myUserId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const partnerId = await this.getPartnerId(conversationId, myUserId);
    if (!partnerId) return;
    this.server.to(`user:${partnerId}`).emit(event, {
      ...payload,
      conversationId,
      fromUserId: myUserId,
    });
  }

  @SubscribeMessage('call:offer')
  async handleCallOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; sdp: string; type: string },
  ): Promise<void> {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    await this.relayCallEvent('call:offer', data.conversationId, userId, {
      sdp: data.sdp,
      type: data.type,
    });
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; sdp: string; type: string },
  ): Promise<void> {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    await this.relayCallEvent('call:answer', data.conversationId, userId, {
      sdp: data.sdp,
      type: data.type,
    });
  }

  @SubscribeMessage('call:ice')
  async handleCallIce(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; candidate: Record<string, unknown> },
  ): Promise<void> {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    await this.relayCallEvent('call:ice', data.conversationId, userId, {
      candidate: data.candidate,
    });
  }

  @SubscribeMessage('call:hangup')
  async handleCallHangup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    const userId = client.data?.userId as string | undefined;
    if (!userId) return;
    await this.relayCallEvent('call:hangup', data.conversationId, userId, {});
  }

  async handleConnection(client: Socket) {
    // Ищем токен в handshake — сначала в auth, потом в query
    const rawToken =
      (client.handshake.auth?.token as string | undefined) ||
      (client.handshake.query?.token as string | undefined);
    if (!rawToken) {
      this.logger.warn(`WS connection without token, disconnecting: ${client.id}`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtUserPayload>(rawToken);
      const userId = payload.sub;
      // Комната юзера — каждый юзер подписан только на свою.
      await client.join(`user:${userId}`);
      client.data.userId = userId;
      this.logger.log(`WS connected: user ${userId.slice(0, 8)} → ${client.id}`);
    } catch (e) {
      this.logger.warn(
        `WS connection with invalid token, disconnecting: ${(e as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      this.logger.log(
        `WS disconnected: user ${userId.slice(0, 8)} → ${client.id}`,
      );
    }
  }

  /**
   * Отправить событие `message:new` всем подключённым клиентам получателя.
   * Вызывается из ChatController после успешного создания сообщения.
   */
  emitNewMessage(recipientUserId: string, payload: unknown) {
    this.server.to(`user:${recipientUserId}`).emit('message:new', payload);
  }

  /**
   * Отправить событие `notification:new` получателю уведомления.
   * Вызывается из ChatController и PostsController через NotificationsService
   * (или напрямую после вызова notify*).
   */
  emitNewNotification(recipientUserId: string, payload: unknown) {
    this.server
      .to(`user:${recipientUserId}`)
      .emit('notification:new', payload);
  }
}
