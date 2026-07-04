import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/configuration';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [
    // Нужен для того, чтобы JwtAuthGuard мог verifyAsync — как и в PostsModule.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [JwtAuthGuard],
})
export class UploadsModule {}
