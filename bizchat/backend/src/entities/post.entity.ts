import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Factory } from './factory.entity';

export type PostType = 'product' | 'reel' | 'hot_deal' | 'group_buy';
export type StockStatus = 'in_stock' | 'pre_order' | 'out_of_stock';

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
  width?: number;
  height?: number;
  thumbnail?: string;
}

export interface PriceTier {
  quantity: number;
  price: number;
}

@Entity({ name: 'posts' })
@Index('idx_posts_factory_created', ['factoryId', 'createdAt'])
@Index('idx_posts_type', ['type'])
@Index('idx_posts_hashtags', ['hashtags'])
@Index('idx_posts_hot_deal', ['isHotDeal', 'dealExpiresAt'])
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'factory_id', type: 'uuid' })
  factoryId!: string;

  @ManyToOne(() => Factory, (factory) => factory.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'factory_id' })
  factory!: Factory;

  @Column({ type: 'varchar', length: 16, default: 'product' })
  type!: PostType;

  // [{url, type, width, height, thumbnail}, ...] — до 10 слайдов карусели
  @Column({ type: 'jsonb', default: () => "'[]'" })
  media!: MediaItem[];

  @Column({ type: 'varchar', length: 256 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'article_number', type: 'varchar', length: 64, nullable: true })
  articleNumber!: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  hashtags!: string[];

  @Column({
    name: 'price_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  priceAmount!: string; // numeric приходит как строка — избегаем потери точности

  @Column({
    name: 'price_currency',
    type: 'varchar',
    length: 3,
  })
  priceCurrency!: string;

  // [{quantity: 500, price: "4.25"}, {quantity: 1000, price: "3.50"}]
  @Column({
    name: 'price_tiers',
    type: 'jsonb',
    default: () => "'[]'",
  })
  priceTiers!: PriceTier[];

  @Column({ type: 'int', default: 1 })
  moq!: number;

  @Column({ name: 'shipping_days', type: 'int', default: 7 })
  shippingDays!: number;

  @Column({
    name: 'stock_status',
    type: 'varchar',
    length: 16,
    default: 'in_stock',
  })
  stockStatus!: StockStatus;

  @Column({ name: 'likes_count', type: 'int', default: 0 })
  likesCount!: number;

  @Column({ name: 'comments_count', type: 'int', default: 0 })
  commentsCount!: number;

  @Column({ name: 'shares_count', type: 'int', default: 0 })
  sharesCount!: number;

  @Column({ name: 'views_count', type: 'int', default: 0 })
  viewsCount!: number;

  @Column({ name: 'is_hot_deal', type: 'boolean', default: false })
  isHotDeal!: boolean;

  @Column({ name: 'discount_percent', type: 'int', default: 0 })
  discountPercent!: number;

  @Column({
    name: 'deal_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  dealExpiresAt!: Date | null;

  // ===== Group Buy (Blueprint §2.6) =====
  // Для постов с type='group_buy'. Для остальных типов — NULL / 0.

  @Column({
    name: 'group_buy_target_quantity',
    type: 'int',
    nullable: true,
  })
  groupBuyTargetQuantity!: number | null;

  @Column({
    name: 'group_buy_deadline',
    type: 'timestamptz',
    nullable: true,
  })
  groupBuyDeadline!: Date | null;

  @Column({
    name: 'group_buy_current_quantity',
    type: 'int',
    default: 0,
  })
  groupBuyCurrentQuantity!: number;

  @Column({
    name: 'group_buy_participant_count',
    type: 'int',
    default: 0,
  })
  groupBuyParticipantCount!: number;

  @Column({
    name: 'group_buy_unit_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  groupBuyUnitPrice!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
