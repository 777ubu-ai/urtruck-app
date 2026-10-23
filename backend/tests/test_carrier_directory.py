"""Каталог не подтверждает наличие свободной машины и не истекает по TTL ленты."""
import sqlite3
import unittest
import tempfile
import os
from pathlib import Path
from unittest.mock import patch
from services.carrier_directory import publish_contacts, list_contacts


def contact(number=1):
    return {'id': 'carrier_' + f'{number:020x}', 'name': 'Тестовый перевозчик', 'record_type': 'carrier',
            'phones': ['+77000000001'], 'emails': [], 'city': 'Алматы', 'country': 'Казахстан',
            'transport_type': 'Рефрижератор', 'notes': '', 'availability': 'unknown',
            'publication_status': 'ready_for_directory_import', 'phone_review': [], 'shared_phone_with_other_contacts': [],
            'iin': 'DO_NOT_RETURN', 'birthday': 'DO_NOT_RETURN', 'provenance': [{'source': 'Публичный справочник', 'file': 'private-name.xlsx'}]}


class CarrierDirectoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'catalog.sqlite3'
        env = patch.dict(os.environ, {'EXTERNAL_CARRIER_DIRECTORY_DB': str(self.path)})
        env.start()
        self.addCleanup(env.stop)

    def test_persistent_import_pagination_and_no_private_fields(self):
        rows = [contact(i) for i in range(1, 66)]
        self.assertEqual(publish_contacts(rows, self.path), {'active': 65, 'integrity': 'ok'})
        first = list_contacts(limit=30)
        self.assertEqual(first['total'], 65)
        second = list_contacts(limit=30, cursor=first['next_cursor'])
        last = list_contacts(limit=30, cursor=second['next_cursor'])
        self.assertEqual(len(last['items']), 5)
        self.assertIsNone(last['next_cursor'])
        self.assertEqual(len({r['id'] for page in (first, second, last) for r in page['items']}), 65)
        r = first['items'][0]
        self.assertEqual(r['kind'], 'carrier_contact')
        self.assertEqual(r['availability'], 'unknown')
        self.assertFalse(any(k in r for k in ('iin', 'birthday', 'vehicle_count', 'provenance')))
        self.assertIsNone(r['expires_at'])
        self.assertIsNone(r['source_published_at'])
        self.assertEqual(r['sources'], ['Публичный справочник'])
        imported_at = r['imported_at']
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE carrier_directory SET status='hidden' WHERE sequence=1")
        self.assertEqual(publish_contacts(rows, self.path)['active'], 64)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT imported_at FROM carrier_directory WHERE sequence=1').fetchone()[0], imported_at)
            db.execute("UPDATE carrier_directory SET imported_at='2000-01-01T00:00:00+00:00'")
        self.assertEqual(list_contacts(query='алмАты')['total'], 64)
        self.assertEqual(list_contacts(query='%')['total'], 0)
        self.assertEqual(list_contacts(query="' OR 1=1 --")['total'], 0)
        self.assertEqual(self.path.stat().st_mode & 0o077, 0)

    def test_invalid_contact_does_not_create_database(self):
        changes = [{'phones': ['not a phone']}, {'availability': 'available'}, {'phone_review': ['bad']},
                   {'shared_phone_with_other_contacts': ['other']}, {'record_type': 'vehicle'}, {'id': '../private'}]
        for change in changes:
            with self.subTest(change=change):
                with self.assertRaises(ValueError):
                    publish_contacts([{**contact(), **change}], self.path)
                self.assertFalse(self.path.exists())

    def test_review_rows_not_published(self):
        row = {**contact(), 'publication_status': 'review_no_phone'}
        self.assertEqual(publish_contacts([row], self.path)['active'], 0)
        self.assertEqual(list_contacts()['total'], 0)

    def test_missing_catalog_is_empty_without_creating_db(self):
        self.assertEqual(list_contacts()['items'], [])
        self.assertFalse(self.path.exists())

    def test_symlink_database_rejected(self):
        target = Path(self.tmp.name) / 'target.db'
        target.write_text('preserve')
        self.path.symlink_to(target)
        with self.assertRaises(ValueError):
            publish_contacts([contact()], self.path)
        self.assertEqual(target.read_text(), 'preserve')

    def test_existing_application_database_is_not_modified(self):
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE users(id TEXT)')
            db.execute("INSERT INTO users VALUES('preserve')")
        original = self.path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'unrelated_tables'):
            publish_contacts([contact()], self.path)
        self.assertEqual(self.path.read_bytes(), original)

    def test_single_feed_continues_from_ads_into_permanent_contacts(self):
        from services.carrier_directory import append_contacts
        publish_contacts([contact(i) for i in range(1, 5)], self.path)
        ads = {'items': [{'id': 'real-ad-1'}, {'id': 'real-ad-2'}], 'next_cursor': None}
        page = append_contacts(ads, limit=3)
        self.assertEqual(len(page['items']), 3)
        self.assertEqual(page['items'][2]['kind'], 'carrier_contact')
        self.assertEqual(page['next_cursor'], 'carrier:1')
        rest = list_contacts(cursor=1, limit=30)
        self.assertEqual(len(rest['items']), 3)
        full = append_contacts(ads, limit=2)
        self.assertEqual(full['next_cursor'], 'carrier:0')
        more_ads = {**ads, 'next_cursor': 'existing-live-cursor'}
        self.assertEqual(append_contacts(more_ads, limit=30), more_ads)
