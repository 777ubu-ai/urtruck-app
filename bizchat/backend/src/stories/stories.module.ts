import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { Story } from '../entities/story.entity';
import { Factory } from '../entities/factory.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StoriesController } from './stories.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Story, Factory]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
  ],
  controllers: [StoriesController],
  providers: [JwtAuthGuard],
})
export class StoriesModule {}
