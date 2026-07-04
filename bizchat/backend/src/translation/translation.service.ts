import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type { AppConfig } from '../config/configuration';

/**
 * Сервис перевода текста. MVP-реализация — **stub**: возвращает исходный
 * текст с префиксом `[${targetLang}]`, чтобы визуально было видно, что
 * перевод сработал, и проверить весь flow.
 *
 * В prod тут будет Claude API (Anthropic SDK) + fallback на Google Translate
 * (Blueprint §технологический стек). Переключение будет по env переменной
 * `TRANSLATION_PROVIDER=claude|google|stub`.
 *
 * Кеш на уровне процесса (in-memory Map). В prod заменить на Redis:
 * ключ `translate:<sha256(text+target+source)>` → `translated`.
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly provider: string;
  private readonly cache = new Map<string, string>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    // В configuration.ts пока нет поля translation — читаем напрямую из env.
    this.provider = process.env.TRANSLATION_PROVIDER || 'stub';
    this.logger.log(`Translation provider: ${this.provider}`);
  }

  /**
   * Перевести текст на указанный язык. Если source не указан, сервис
   * самостоятельно определяет язык (в stub — просто игнорирует).
   * Лимит длины: 5000 символов за запрос.
   */
  async translate(
    text: string,
    targetLang: string,
    sourceLang?: string,
  ): Promise<{
    translated: string;
    sourceLang: string;
    targetLang: string;
    fromCache: boolean;
  }> {
    const normalized = text.trim();
    if (normalized.length === 0) {
      return {
        translated: '',
        sourceLang: sourceLang || 'unknown',
        targetLang,
        fromCache: false,
      };
    }
    if (normalized.length > 5000) {
      throw new Error('Слишком длинный текст для перевода (макс 5000 символов)');
    }

    // Если source == target — ничего не переводим
    if (sourceLang && sourceLang === targetLang) {
      return {
        translated: normalized,
        sourceLang,
        targetLang,
        fromCache: false,
      };
    }

    const cacheKey = this.makeCacheKey(normalized, targetLang, sourceLang);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return {
        translated: cached,
        sourceLang: sourceLang || 'auto',
        targetLang,
        fromCache: true,
      };
    }

    let translated: string;
    switch (this.provider) {
      case 'claude':
        translated = await this.translateWithClaude(
          normalized,
          targetLang,
          sourceLang,
        );
        break;
      case 'google':
        translated = await this.translateWithGoogle(
          normalized,
          targetLang,
          sourceLang,
        );
        break;
      case 'stub':
      default:
        translated = this.stubTranslate(normalized, targetLang);
        break;
    }

    this.cache.set(cacheKey, translated);
    // Примитивная защита от роста: обрезаем когда кеш > 5000 записей
    if (this.cache.size > 5000) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }

    return {
      translated,
      sourceLang: sourceLang || 'auto',
      targetLang,
      fromCache: false,
    };
  }

  /**
   * Stub реализация: возвращает текст с видимым префиксом. Позволяет
   * проверить весь flow (UI → API → кеш → ответ) без реальных затрат.
   */
  private stubTranslate(text: string, targetLang: string): string {
    return `[${targetLang}] ${text}`;
  }

  /**
   * Placeholder для реального Claude API. В prod тут будет:
   *   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
   *   const result = await client.messages.create({ ... });
   * Сейчас просто логируем и fallback'им на stub.
   */
  private async translateWithClaude(
    text: string,
    targetLang: string,
    sourceLang?: string,
  ): Promise<string> {
    this.logger.warn(
      'Claude provider выбран, но реализация — stub. ' +
        'Установите ANTHROPIC_API_KEY и раскомментируйте код в translation.service.ts',
    );
    // Когда API key будет:
    // const prompt = `Translate the following text to ${targetLang}. Output only the translation, no commentary:\n\n${text}`;
    // const response = await this.anthropic.messages.create({
    //   model: 'claude-opus-4-6',
    //   max_tokens: 2000,
    //   messages: [{ role: 'user', content: prompt }],
    // });
    // return response.content[0].text.trim();
    return this.stubTranslate(text, targetLang);
  }

  /**
   * Бесплатный Google Translate через публичный API (без ключа).
   * Используется translate.googleapis.com — тот же endpoint что и Google Translate web.
   * Rate-limit: ~100 req/hour с одного IP. Достаточно для MVP.
   * В production заменить на платный Google Cloud Translation API с ключом.
   */
  private async translateWithGoogle(
    text: string,
    targetLang: string,
    sourceLang?: string,
  ): Promise<string> {
    try {
      const sl = sourceLang || 'auto';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BizChat/1.0' },
      });
      if (!res.ok) {
        this.logger.warn(
          `Google Translate HTTP ${res.status} — fallback to stub`,
        );
        return this.stubTranslate(text, targetLang);
      }
      const json = (await res.json()) as unknown[][];
      // Response: [[["translated text","original text",null,null,10],...],null,"zh"]
      const sentences = json[0] as unknown[][];
      const translated = sentences
        .map((s: unknown[]) => (s[0] as string) || '')
        .join('');
      if (!translated) return this.stubTranslate(text, targetLang);
      return translated;
    } catch (e) {
      this.logger.warn(
        `Google Translate failed: ${(e as Error).message} — fallback to stub`,
      );
      return this.stubTranslate(text, targetLang);
    }
  }

  private makeCacheKey(
    text: string,
    targetLang: string,
    sourceLang?: string,
  ): string {
    return createHash('sha256')
      .update(`${sourceLang || 'auto'}:${targetLang}:${text}`)
      .digest('hex');
  }
}
