import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Post } from './post.entity';

/**
 * Сохранение поста пользователем (bookmark). По аналогии с PostLike.
 *
 * Композитный PK (user_id, post_id) на уровне БД гарантирует идемпотентность.
 * Без счётчика на постах — сохранения приватны.
 */
@Entity({ name: 'post_saves' })
@Index('idx_post_saves_user_created', ['userId', 'createdAt'])
export class PostSave {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'post_id', type: 'uuid' })
  postId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: Post;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
