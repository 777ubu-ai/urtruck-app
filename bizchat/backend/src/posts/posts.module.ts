import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { Post } from '../entities/post.entity';
import { PostLike } from '../entities/post-like.entity';
import { PostSave } from '../entities/post-save.entity';
import { PostComment } from '../entities/post-comment.entity';
import { Factory } from '../entities/factory.entity';
import { Follow } from '../entities/follow.entity';
import { GroupBuyOrder } from '../entities/group-buy-order.entity';
import { User } from '../entities/user.entity';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
} from '../auth/jwt-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { PostsController } from './posts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PostLike, PostSave, PostComment, Factory, Follow, GroupBuyOrder, User]),
    // JwtModule нужен здесь, чтобы guard'ы могли verifyAsync() с тем же secret,
    // что и AuthModule. Регистрируем заново — Nest не шарит провайдеры.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
    NotificationsModule,
    ChatModule,
  ],
  controllers: [PostsController],
  providers: [JwtAuthGuard, OptionalJwtAuthGuard],
})
export class PostsModule {}
