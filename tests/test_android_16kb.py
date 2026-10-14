import importlib.util
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("gate", Path(__file__).resolve().parents[1] / "scripts/verify_android_16kb.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def elf(alignment=16384, address=0, endian="<"):
    data = bytearray(120)
    data[:6] = b"\x7fELF\x02" + (b"\x01" if endian == "<" else b"\x02")
    struct.pack_into(endian + "Q", data, 32, 64)
    struct.pack_into(endian + "HH", data, 54, 56, 1)
    struct.pack_into(endian + "IIQQQQQQ", data, 64, 1, 5, 0, address, address, 0, 0, alignment)
    return data


class PageSizeGate(unittest.TestCase):
    def test_16kb_and_64kb_loads_pass(self):
        gate.verify_elf(elf())
        gate.verify_elf(elf(65536))

    def test_4kb_load_fails(self):
        with self.assertRaisesRegex(ValueError, "4096"):
            gate.verify_elf(elf(4096))

    def test_non_power_of_two_fails(self):
        with self.assertRaises(ValueError):
            gate.verify_elf(elf(20000))

    def test_incongruent_load_fails(self):
        with self.assertRaisesRegex(ValueError, "congruent"):
            gate.verify_elf(elf(address=4096))

    def test_truncated_headers_fail(self):
        with self.assertRaises(ValueError):
            gate.verify_elf(elf()[:70])

    def test_big_endian(self):
        gate.verify_elf(elf(endian=">"))

    def test_archive_reports_bad_library_and_empty_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.aab"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("base/lib/arm64-v8a/good.so", elf())
                archive.writestr("base/lib/x86_64/maps.so", elf(4096))
            count, failures = gate.verify_archive(path)
            self.assertEqual(count, 2)
            self.assertEqual(len(failures), 1)
            self.assertIn("maps.so", failures[0])
            with zipfile.ZipFile(path, "w"):
                pass
            self.assertTrue(gate.verify_archive(path)[1])


if __name__ == "__main__":
    unittest.main()
