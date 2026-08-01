import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Post } from './post.entity';

/**
 * Расширение User для пользователей типа 'factory'.
 * user_id = primary key (1:1 с users).
 */
@Entity({ name: 'factories' })
@Index('idx_factories_hashtags', ['hashtags'])
@Index('idx_factories_trust_score', ['trustScore'])
export class Factory {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, (user) => user.factory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'company_name', type: 'varchar', length: 256 })
  companyName!: string;

  @Column({ name: 'business_license', type: 'text', nullable: true })
  businessLicense!: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  hashtags!: string[];

  @Column({
    name: 'location_lat',
    type: 'double precision',
    nullable: true,
  })
  locationLat!: number | null;

  @Column({
    name: 'location_lng',
    type: 'double precision',
    nullable: true,
  })
  locationLng!: number | null;

  @Column({ name: 'moq_default', type: 'int', default: 1 })
  moqDefault!: number;

  @Column({ name: 'shipping_days_min', type: 'int', default: 7 })
  shippingDaysMin!: number;

  @Column({ name: 'shipping_days_max', type: 'int', default: 14 })
  shippingDaysMax!: number;

  // Валюта в которой завод выставляет цены (USD, CNY, EUR, ...)
  @Column({
    name: 'price_currency',
    type: 'varchar',
    length: 3,
    default: 'USD',
  })
  priceCurrency!: string;

  /// «О себе» завода. Раньше было varchar(16) — не помещалась даже короткая
  /// фраза, поэтому поле не использовалось. Теперь полноценный текст.
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /// Сайт компании.
  @Column({ type: 'varchar', length: 256, nullable: true })
  website!: string | null;

  /// Физический адрес (этаж/ряд/секция торгового центра и т.п.) — текст,
  /// не координаты. locationLat/locationLng ниже это точка на карте,
  /// а это то, что реально пишут на площадках-источниках и что нужно
  /// показать покупателю как есть.
  @Column({ type: 'text', nullable: true })
  address!: string | null;

  /// WhatsApp для связи — основной канал переговоров по опту.
  @Column({ type: 'varchar', length: 32, nullable: true })
  whatsapp!: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  // Автоматический рейтинг 0..100, пересчитывается раз в сутки
  @Column({ name: 'trust_score', type: 'int', default: 50 })
  trustScore!: number;

  @Column({ name: 'avg_response_time_min', type: 'int', default: 0 })
  avgResponseTimeMin!: number;

  @Column({ name: 'success_rate_percent', type: 'int', default: 0 })
  successRatePercent!: number;

  @Column({ name: 'description_match_score', type: 'int', default: 0 })
  descriptionMatchScore!: number;

  @Column({ name: 'total_deals', type: 'int', default: 0 })
  totalDeals!: number;

  @Column({ name: 'total_products', type: 'int', default: 0 })
  totalProducts!: number;

  // Денормализованные счётчики отзывов — пересчитываются в ReviewsService
  // в той же транзакции что и INSERT/UPDATE/DELETE отзыва.
  @Column({
    name: 'avg_rating',
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
  })
  avgRating!: string;

  @Column({ name: 'reviews_count', type: 'int', default: 0 })
  reviewsCount!: number;

  @Column({
    name: 'trust_score_updated_at',
    type: 'timestamptz',
    nullable: true,
  })
  trustScoreUpdatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Post, (post) => post.factory)
  posts?: Post[];
}
