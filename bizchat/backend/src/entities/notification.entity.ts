import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'message'
  | 'review'
  | 'group_buy_completed';

/**
 * Денормализованное уведомление. Все «вторичные» поля
 * (`actor_name`, `post_title`, `preview`, `post_thumbnail_url`) — копии
 * данных на момент создания, чтобы не делать JOIN'ы при чтении ленты
 * и чтобы уведомление продолжало показываться даже если связанный
 * пост/беседа были удалены.
 */
@Entity({ name: 'notifications' })
@Index('idx_notif_recipient_created', ['recipientId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ name: 'actor_name', type: 'varchar', length: 256 })
  actorName!: string;

  @Column({ type: 'varchar', length: 16 })
  type!: NotificationType;

  @Column({ name: 'post_id', type: 'uuid', nullable: true })
  postId!: string | null;

  @Column({
    name: 'post_title',
    type: 'varchar',
    length: 256,
    nullable: true,
  })
  postTitle!: string | null;

  @Column({
    name: 'post_thumbnail_url',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  postThumbnailUrl!: string | null;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  preview!: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
