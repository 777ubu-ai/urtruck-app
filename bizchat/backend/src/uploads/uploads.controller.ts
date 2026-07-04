import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Upload эндпоинт для медиа-файлов. MVP-реализация: сохраняем на локальный
 * диск в `backend/uploads/`, возвращаем относительные URL (`/uploads/xxx.jpg`).
 * В prod — заменить на S3/R2 adapter (Blueprint §технологический стек).
 *
 * Принимаем image/* (до 10 МБ) и video/* (до 50 МБ). Тип определяется
 * по mime-type загруженного файла и возвращается клиенту в поле `type`,
 * чтобы фронт мог рендерить корректный плеер.
 */
@Controller('uploads')
export class UploadsController {
  /**
   * POST /api/v1/uploads/images
   *
   * multipart/form-data с полем `files` (одно или несколько). Принимает
   * картинки И видео, несмотря на название endpoint'а (имя сохраняем для
   * backwards compat — с тех пор как видео добавлено, поле теперь
   * правильнее называть `/uploads/media`).
   */
  @Post('images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          // UUID + оригинальное расширение. Если extname пусто — fallback на .jpg.
          const ext = (extname(file.originalname) || '.jpg').toLowerCase();
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: {
        // 50 МБ — нужно для видео. Картинки обычно <2 МБ, проверяем
        // дополнительно на content-side (см. fileFilter).
        fileSize: 50 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
          return cb(null, true);
        }
        if (file.mimetype.startsWith('video/')) {
          return cb(null, true);
        }
        return cb(
          new BadRequestException('Принимаются только изображения и видео'),
          false,
        );
      },
    }),
  )
  uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Нужно прикрепить хотя бы один файл');
    }

    return {
      files: files.map((f) => {
        const isVideo = f.mimetype.startsWith('video/');
        return {
          // Относительный URL — фронт сам знает baseUrl и скомбинирует.
          url: `/uploads/${f.filename}`,
          type: (isVideo ? 'video' : 'image') as 'image' | 'video',
          size: f.size,
          originalName: f.originalname,
        };
      }),
    };
  }
}
