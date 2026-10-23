#!/usr/bin/env python3
"""Публикация подготовленных контактов в отдельную БД каталога без создания машин."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from services.carrier_directory import publish_contacts

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--database', required=True)
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text())
    records = payload['records'] if isinstance(payload, dict) else payload
    result = publish_contacts(records, args.database)
    print(json.dumps(result))
