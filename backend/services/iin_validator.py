"""Валидация ИИН РК с контрольной суммой."""


def validate_iin_kz(iin: str) -> bool:
    """Алгоритм контрольной суммы ИИН РК."""
    if not iin or not iin.isdigit() or len(iin) != 12:
        return False

    weights_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    weights_2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]

    total = sum(int(iin[i]) * weights_1[i] for i in range(11))
    checksum = total % 11

    if checksum == 10:
        total = sum(int(iin[i]) * weights_2[i] for i in range(11))
        checksum = total % 11
        if checksum == 10:
            return False

    return checksum == int(iin[11])


def extract_birthdate_from_iin(iin: str) -> str | None:
    """Извлекает дату рождения из ИИН (первые 6 цифр YYMMDD)."""
    if not validate_iin_kz(iin):
        return None
    yy, mm, dd = iin[:2], iin[2:4], iin[4:6]
    # 7-я цифра: 1-2 — XIX век, 3-4 — XX век, 5-6 — XXI век
    century_digit = iin[6]
    century = {
        '1': '18', '2': '18',
        '3': '19', '4': '19',
        '5': '20', '6': '20',
    }.get(century_digit, '20')
    return f"{dd}.{mm}.{century}{yy}"
