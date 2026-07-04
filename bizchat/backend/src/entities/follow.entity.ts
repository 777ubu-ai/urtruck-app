import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Подписка follower → followed. Композитный PK гарантирует идемпотентность.
 * CHECK на уровне БД запрещает подписку на самого себя.
 */
@Entity({ name: 'follows' })
@Index('idx_follows_followed', ['followedId', 'createdAt'])
export class Follow {
  @PrimaryColumn({ name: 'follower_id', type: 'uuid' })
  followerId!: string;

  @PrimaryColumn({ name: 'followed_id', type: 'uuid' })
  followedId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'follower_id' })
  follower!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'followed_id' })
  followed!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
