import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Factory } from './factory.entity';

export type UserType = 'buyer' | 'factory';

@Entity({ name: 'users' })
@Index('idx_users_phone', ['phone'], { unique: true })
@Index('idx_users_referral_code', ['referralCode'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Международный формат: +79991234567 (после SMS-валидации)
  @Column({ type: 'varchar', length: 32, unique: true })
  phone!: string;

  @Column({ type: 'varchar', length: 16 })
  type!: UserType;

  // ISO 3166-1 alpha-2: KZ, RU, CN, US...
  @Column({ name: 'country_code', type: 'char', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  name!: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl!: string | null;

  // Язык UI: ru, en, zh, ...
  @Column({ type: 'varchar', length: 8, default: 'ru' })
  language!: string;

  // Валюта отображения: USD, KZT, CNY, ...
  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({
    name: 'referral_code',
    type: 'varchar',
    length: 32,
    unique: true,
  })
  referralCode!: string;

  @Column({ name: 'referred_by_id', type: 'uuid', nullable: true })
  referredById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'referred_by_id' })
  referredBy!: User | null;

  @Column({ name: 'bonus_points', type: 'int', default: 0 })
  bonusPoints!: number;

  // Часы тишины для уведомлений (HH:MM в таймзоне пользователя)
  @Column({
    name: 'quiet_hours_start',
    type: 'varchar',
    length: 5,
    nullable: true,
  })
  quietHoursStart!: string | null;

  @Column({
    name: 'quiet_hours_end',
    type: 'varchar',
    length: 5,
    nullable: true,
  })
  quietHoursEnd!: string | null;

  @Column({ type: 'boolean', default: false })
  verified!: boolean;

  /**
   * Глобальный toggle push-уведомлений. Если false — `PushService.sendToUser`
   * не отправляет баннер (но in-app notification в таблице `notifications`
   * всё равно создаётся и появляется в колокольчике).
   */
  @Column({ name: 'push_enabled', type: 'boolean', default: true })
  pushEnabled!: boolean;

  /**
   * Гранулярные настройки пушей по категориям. Фронт читает и показывает
   * 5 тумблеров в настройках профиля. Если значение false для конкретного
   * типа — сервер пропускает отправку push для этой категории (in-app всё
   * равно создаётся). Дефолт: все true.
   */
  @Column({
    name: 'notification_prefs',
    type: 'jsonb',
    default: () =>
      `'{"likes":true,"comments":true,"messages":true,"reviews":true,"groupBuy":true}'::jsonb`,
  })
  notificationPrefs!: {
    likes: boolean;
    comments: boolean;
    messages: boolean;
    reviews: boolean;
    groupBuy: boolean;
  };

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;

  @OneToOne(() => Factory, (factory) => factory.user)
  factory?: Factory;
}
