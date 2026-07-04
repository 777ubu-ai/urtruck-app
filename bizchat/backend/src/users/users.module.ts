import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { User } from '../entities/user.entity';
import { Factory } from '../entities/factory.entity';
import { Post as PostEntity } from '../entities/post.entity';
import { PostSave } from '../entities/post-save.entity';
import { Follow } from '../entities/follow.entity';
import {
  JwtAuthGuard,
  OptionalJwtAuthGuard,
} from '../auth/jwt-auth.guard';
import { UsersController } from './users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Factory, PostEntity, PostSave, Follow]),
    // Тот же secret что в AuthModule — JWT verifyAsync должен использовать его.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [JwtAuthGuard, OptionalJwtAuthGuard],
})
export class UsersModule {}
