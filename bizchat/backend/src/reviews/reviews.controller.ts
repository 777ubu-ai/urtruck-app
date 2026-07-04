import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReviewsService } from './reviews.service';

interface UpsertReviewBody {
  rating: number;
  text?: string;
  photos?: Array<{ url: string; type?: string }>;
}

@Controller('factories')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  /**
   * GET /api/v1/factories/:id/reviews?limit=20&cursor=...
   * Список отзывов о заводе. Публичный (под OptionalJwtAuthGuard) — гости
   * тоже могут читать отзывы, это часть discovery.
   */
  @Get(':id/reviews')
  @UseGuards(OptionalJwtAuthGuard)
  async list(
    @Param('id', new ParseUUIDPipe()) factoryId: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string,
  ) {
    const limit = Math.min(parseInt(limitRaw || '20', 10), 50);
    const cursor = cursorRaw ? new Date(cursorRaw) : undefined;
    const { items, hasMore, nextCursor } = await this.service.listForFactory({
      factoryId,
      limit,
      cursor,
    });
    return {
      data: items,
      meta: { limit, hasMore, nextCursor },
    };
  }

  /**
   * GET /api/v1/factories/:id/reviews/me
   * Существующий отзыв текущего юзера на конкретный завод (для предзаполнения
   * формы редактирования). Возвращает null если отзыва нет.
   */
  @Get(':id/reviews/me')
  @UseGuards(JwtAuthGuard)
  async getMine(
    @Param('id', new ParseUUIDPipe()) factoryId: string,
    @Req() req: RequestWithUser,
  ) {
    const review = await this.service.getMyReview({
      factoryId,
      userId: req.user!.sub,
    });
    if (!review) return { review: null };
    return {
      review: {
        id: review.id,
        rating: review.rating,
        text: review.text,
        photos: review.photos,
        isVerified: review.isVerified,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      },
    };
  }

  /**
   * POST /api/v1/factories/:id/reviews
   * Создать или обновить отзыв текущего юзера. UPSERT по (factory_id, buyer_id).
   */
  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async upsert(
    @Param('id', new ParseUUIDPipe()) factoryId: string,
    @Body() body: UpsertReviewBody,
    @Req() req: RequestWithUser,
  ) {
    if (!body || typeof body.rating !== 'number') {
      throw new BadRequestException('rating обязателен');
    }
    if (body.text && body.text.length > 2000) {
      throw new BadRequestException('text не должен превышать 2000 символов');
    }
    const review = await this.service.upsert({
      factoryId,
      buyerId: req.user!.sub,
      rating: body.rating,
      text: body.text,
      photos: body.photos,
    });
    return {
      id: review.id,
      rating: review.rating,
      text: review.text,
      photos: review.photos,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  /**
   * DELETE /api/v1/factories/:factoryId/reviews/:reviewId
   * Удалить свой отзыв. Service сам проверяет авторство — 403 если не свой.
   */
  @Delete(':factoryId/reviews/:reviewId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async delete(
    @Param('factoryId', new ParseUUIDPipe()) _factoryId: string,
    @Param('reviewId', new ParseUUIDPipe()) reviewId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.service.delete({ reviewId, userId: req.user!.sub });
  }
}
