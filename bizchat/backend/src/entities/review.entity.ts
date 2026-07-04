import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Отзыв байера о заводе. Один байер может оставить максимум один отзыв
 * на конкретный завод (UNIQUE constraint), повторный POST = UPDATE.
 *
 * `photos` хранит массив `[{url, type: 'image' | 'video'}]` — формат
 * совпадает с posts.media для единообразия media-handling на фронте.
 */
@Entity({ name: 'reviews' })
@Index('idx_reviews_factory_created', ['factoryId', 'createdAt'])
@Unique('uq_reviews_factory_buyer', ['factoryId', 'buyerId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'factory_id', type: 'uuid' })
  factoryId!: string;

  @Column({ name: 'buyer_id', type: 'uuid' })
  buyerId!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  text!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  photos!: Array<{ url: string; type?: string }>;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
