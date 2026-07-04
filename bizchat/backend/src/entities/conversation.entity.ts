import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Message } from './message.entity';

/**
 * Direct-беседа 1-на-1. Пара (participant_a_id, participant_b_id) уникальна
 * и нормализована: a < b лексикографически (см. CHECK constraint в миграции).
 * Это даёт идемпотентность поиска беседы — всегда сортируем UUID и ищем.
 *
 * `last_message_*` — денормализованный кеш для conversation list, чтобы не
 * делать N+1 запросов за последним сообщением каждой беседы.
 */
@Entity({ name: 'conversations' })
@Index('idx_conv_a', ['participantAId', 'lastMessageAt'])
@Index('idx_conv_b', ['participantBId', 'lastMessageAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'participant_a_id', type: 'uuid' })
  participantAId!: string;

  @Column({ name: 'participant_b_id', type: 'uuid' })
  participantBId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participant_a_id' })
  participantA!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participant_b_id' })
  participantB!: User;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  @Column({
    name: 'last_message_text',
    type: 'varchar',
    length: 2000,
    nullable: true,
  })
  lastMessageText!: string | null;

  @Column({ name: 'last_message_sender_id', type: 'uuid', nullable: true })
  lastMessageSenderId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => Message, (m) => m.conversation)
  messages?: Message[];
}
