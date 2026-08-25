"""#293: Тесты безопасности — HTML-инъекция в скрапленных данных CGR.

Парсеры извлекают текст через BeautifulSoup.get_text() — HTML-тэги
пропадают, но текстовое содержимое может содержать XSS-payload.
_sanitize_text() должен escape-ить HTML-сущности и обрезать длину.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from cgr.parsers import _sanitize_text


def test_sanitize_strips_html_entities():
    """HTML-тэги в тексте экранируются."""
    payload = '<script>alert("xss")</script>'
    result = _sanitize_text(payload)
    assert "<script>" not in result
    assert "&lt;script&gt;" in result


def test_sanitize_img_onerror():
    """<img onerror=...> экранируется."""
    payload = '<img src=x onerror=alert(1)>'
    result = _sanitize_text(payload)
    assert "<img" not in result
    assert "onerror" not in result or "&lt;" in result


def test_sanitize_control_chars():
    """Управляющие символы удаляются."""
    payload = "Нур\x00Жолы\x0eТест"
    result = _sanitize_text(payload)
    assert "\x00" not in result
    assert "\x0e" not in result
    assert "НурЖолыТест" in result


def test_sanitize_max_len():
    """Текст обрезается до max_len."""
    payload = "A" * 1000
    result = _sanitize_text(payload, max_len=100)
    assert len(result) == 100


def test_sanitize_empty():
    """Пустая строка → пустая строка."""
    assert _sanitize_text("") == ""
    assert _sanitize_text(None) == ""


def test_sanitize_normal_text_unchanged():
    """Обычный текст (без спецсимволов) не меняется."""
    normal = "Нур Жолы - Хоргос 2026-08-25 14:30"
    assert _sanitize_text(normal) == normal


def test_parse_public_list_with_xss_in_table():
    """parse_public_list sanitizes checkpoint/status fields from scraped HTML."""
    from cgr.parsers import parse_public_list

    xss_html = """
    <table>
        <tr><th>Пункт</th><th>ГРНЗ</th><th>Дата</th><th>Статус</th></tr>
        <tr>
            <td><script>alert('xss')</script>Хоргос</td>
            <td>123ABC02</td>
            <td>2026-08-25 14:30</td>
            <td><img onerror=steal()>В очереди</td>
        </tr>
    </table>
    """
    rows = parse_public_list(xss_html)
    assert len(rows) == 1
    # Checkpoint name should NOT contain raw HTML tags
    assert "<script>" not in rows[0]["checkpoint"]
    assert "alert" not in rows[0]["checkpoint"]
    # Status raw should not contain raw HTML
    assert "<img" not in rows[0]["status"]["raw"]
