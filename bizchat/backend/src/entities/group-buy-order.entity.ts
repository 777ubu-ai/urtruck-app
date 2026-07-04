import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Post } from './post.entity';
import { User } from './user.entity';

/**
 * Заявка байера на участие в group buy. Один юзер = одна активная заявка
 * на конкретный group_buy пост (UNIQUE constraint). При изменении количества
 * используем UPSERT. При отмене — DELETE.
 */
@Entity({ name: 'group_buy_orders' })
@Unique('uq_gbo_post_user', ['postId', 'userId'])
@Index('idx_gbo_user_created', ['userId', 'createdAt'])
@Check('chk_gbo_quantity_positive', '"quantity" >= 1')
export class GroupBuyOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: Post;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
