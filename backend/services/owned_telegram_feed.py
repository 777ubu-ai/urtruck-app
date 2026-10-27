"""Разбор собственного чата UrTruck. Не меняет правила сторонних источников."""
import hashlib
import re
import unicodedata

from services.external_freight_classifier import classify_message
from services.external_freight_parser import block_contacts, map_selected_message, map_selected_messages

OWNED_SOURCE = 'UrTruck_obyavleniya'
_FROM = re.compile(r'(?im)^\s*(?:погрузка|загрузка|откуда)\s*[:：]\s*([^\n]+)')
_TO = re.compile(r'(?im)^\s*(?:выгрузка|куда)\s*[:：]\s*([^\n]+)')


def _clean(text):
    return '\n'.join(''.join(c for c in line if unicodedata.category(c) not in {'So', 'Sk'}
                            and c != '\ufe0f').strip(' *_\t') for line in text.splitlines())


def map_owned_messages(raw):
    """Один собственный пост может дать несколько карточек с общим телефоном."""
    text = raw.get('original_text', raw.get('text', ''))
    if not isinstance(text, str) or not text.strip() or len(text) > 20000:
        raise ValueError('invalid_original_text')
    clean = _clean(text)
    starts = list(_FROM.finditer(clean))
    # Общий телефон — отдельная последняя строка, а не число цены/веса.
    tail = next((line for line in reversed(clean.splitlines()) if line.strip()), '')
    footer = block_contacts(tail)
    residual = tail
    for phone in footer:
        residual = residual.replace(phone, '')
    residual = re.sub(r'(?i)(?:телефон|контакт|phone|tel|общий)', '', residual)
    shared = footer if footer and not re.sub(r'[\s:：,;.+()\-]', '', residual) else []
    # Разные авторы в одном посте требуют явной принадлежности контактов.
    if re.search(r'(?im)^\s*(?:автор|отправитель)\s*:', clean):
        shared = []
    result = []
    if starts:
        prefix = clean[:starts[0].start()].strip()
        common_closure = '\n'.join(line for line in prefix.splitlines()
                                   if classify_message(line)['status'] == 'closed')
        blocks = [clean[m.start():starts[i + 1].start() if i + 1 < len(starts) else len(clean)].strip()
                  for i, m in enumerate(starts)]
        for i, block in enumerate(blocks):
            # Preserve the common closure in every block for importer verification.
            # Other header fields belong only to the first block, never shared prices.
            header = prefix if i == 0 else common_closure
            block = '\n'.join(part for part in (header, block) if part)
            origin, destination = _FROM.search(block), _TO.search(block)
            destinations = {' '.join(m[1].casefold().split()) for m in _TO.finditer(block)}
            normalized = block
            if origin and destination:
                normalized = _TO.sub('', normalized, count=1)
                normalized = _FROM.sub(lambda _: f'{origin[1].strip()} → {destination[1].strip()}', normalized, count=1)
            item_raw = {k: v for k, v in raw.items() if k not in {'text', 'original_text', 'phones', 'contacts'}}
            local = [phone for phone in block_contacts(block) if phone not in shared]
            item_raw.update(text=normalized, contacts=local or shared,
                            segment_id=f'block-{i+1}' if len(blocks) > 1 else str(raw.get('segment_id') or '0'))
            item = map_selected_message(item_raw)
            # map_selected_message scans the rendered text too. For segmented
            # posts that can re-add the post-wide footer to a block that has
            # its own local contact; keep the block ownership decided above.
            item['contacts'] = local or shared
            item['original_text'] = block
            if len(destinations) > 1 and item['status'] == 'active':
                item['status'] = item['classification_status'] = 'review'
            result.append(item)
    else:
        result = map_selected_messages({**raw, 'text': clean, 'original_text': clean})
        for item in result:
            if not item.get('contacts'):
                item['contacts'] = shared
            elif shared and len(item['contacts']) > len(shared):
                item['contacts'] = [phone for phone in item['contacts'] if phone not in shared] or shared
    for item in result:
        # Разбор использует очищенный блок, но пользователю нужен оригинал
        # целиком: эмодзи, контакты в середине и общий телефон в конце.
        item['source_text'] = text
        item['origin_source'] = OWNED_SOURCE
        # Владелец просит пропускать все посты своей группы: неполные поля
        # маршрута/контакта или неоднозначный тип не должны блокировать карточку.
        classification = classify_message(item.get('original_text') or text)
        if item['status'] != 'closed' and classification.get('status') != 'closed':
            item['status'] = 'active'
            if item.get('kind') not in {'cargo', 'vehicle'}:
                item['kind'] = classification.get('kind') or 'cargo'
            item['classification_status'] = 'approved'
        else:
            item['status'] = item['classification_status'] = 'closed'
        item['source_revision'] = hashlib.sha256((text + '\n' + item['segment_id']).encode()).hexdigest()
    return result
