import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslateDto } from './dto/translate.dto';

@Controller('translate')
export class TranslationController {
  constructor(private readonly service: TranslationService) {}

  /**
   * POST /api/v1/translate
   *
   * Переводит текст на указанный язык. Открыт без авторизации — это
   * публичный utility-эндпоинт, который может понадобиться гостям для
   * просмотра постов на родном языке.
   *
   * Ответ кешируется на стороне сервера, повторный запрос с тем же текстом
   * и парой языков вернёт результат из кеша мгновенно.
   */
  @Post()
  async translate(@Body() dto: TranslateDto) {
    try {
      const result = await this.service.translate(
        dto.text,
        dto.targetLang,
        dto.sourceLang,
      );
      return {
        original: dto.text,
        translated: result.translated,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
        fromCache: result.fromCache,
      };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
