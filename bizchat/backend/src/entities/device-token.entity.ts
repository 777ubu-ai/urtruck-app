import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type DevicePlatform = 'android' | 'ios' | 'web';

/**
 * FCM-токен устройства. Один user_id → много токенов (юзер залогинен на
 * нескольких устройствах). Token UNIQUE: один и тот же FCM-токен принадлежит
 * только одному юзеру в каждый момент.
 *
 * При повторной регистрации того же токена обновляем `userId`/`lastSeenAt`
 * через UPSERT (`ON CONFLICT (token) DO UPDATE`) — это покрывает кейс смены
 * аккаунта на одном устройстве.
 */
@Entity({ name: 'device_tokens' })
@Index('idx_device_tokens_user', ['userId'])
@Index('idx_device_tokens_last_seen', ['lastSeenAt'])
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 512, unique: true })
  token!: string;

  @Column({ type: 'varchar', length: 16 })
  platform!: DevicePlatform;

  @Column({ type: 'varchar', length: 8, default: 'ru' })
  language!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({
    name: 'last_seen_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastSeenAt!: Date;
}
