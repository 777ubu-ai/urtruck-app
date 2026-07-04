import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export type StoryMediaType = 'image' | 'video';

/**
 * Story — эфемерный контент с auto-expire через 24 часа.
 * `expires_at` ставится приложением при создании.
 */
@Entity({ name: 'stories' })
@Index('idx_stories_user_created', ['userId', 'createdAt'])
@Index('idx_stories_expires', ['expiresAt'])
export class Story {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'media_url', type: 'varchar', length: 1024 })
  mediaUrl!: string;

  @Column({
    name: 'media_type',
    type: 'varchar',
    length: 16,
    default: 'image',
  })
  mediaType!: StoryMediaType;

  @Column({
    name: 'thumbnail_url',
    type: 'varchar',
    length: 1024,
    nullable: true,
  })
  thumbnailUrl!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  caption!: string | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
