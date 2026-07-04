import {
  Column,
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
 * Лайк поста. Композитный PK (user_id, post_id) на уровне БД гарантирует
 * идемпотентность — повторный INSERT падает с unique-violation, и мы это ловим
 * в сервисе как «уже лайкал, ничего страшного».
 *
 * `posts.likes_count` поддерживается приложением в той же транзакции, что и
 * INSERT/DELETE сюда — см. PostsController.
 */
@Entity({ name: 'post_likes' })
@Index('idx_post_likes_post', ['postId'])
export class PostLike {
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
