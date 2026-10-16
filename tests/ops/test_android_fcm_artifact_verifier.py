import importlib.util
import struct
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "fcm_apk_gate", Path(__file__).parents[2] / "scripts/verify_android_fcm_apk.py"
)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def dex_with_class(descriptor: str) -> bytes:
    encoded = descriptor.encode("ascii")
    data = bytearray(152 + len(encoded) + 2)
    data[:8] = b"dex\n035\0"
    struct.pack_into("<I", data, 56, 1)  # string_ids_size
    struct.pack_into("<I", data, 60, 148)  # string_ids_off
    struct.pack_into("<I", data, 64, 1)  # type_ids_size
    struct.pack_into("<I", data, 68, 144)  # type_ids_off
    struct.pack_into("<I", data, 96, 1)  # class_defs_size
    struct.pack_into("<I", data, 100, 112)  # class_defs_off
    struct.pack_into("<I", data, 144, 0)  # type -> string index
    struct.pack_into("<I", data, 148, 152)  # string -> data offset
    struct.pack_into("<I", data, 112, 0)  # class_def -> type index
    data[152] = len(encoded)
    data[153 : 153 + len(encoded)] = encoded
    data[153 + len(encoded)] = 0
    return bytes(data)


class DexClassVerifier(unittest.TestCase):
    def test_reads_defined_class_descriptors(self):
        classes = gate.dex_defined_classes(dex_with_class(gate.SERVICE_DESCRIPTOR))
        self.assertIn(gate.SERVICE_DESCRIPTOR, classes)

    def test_rejects_reference_text_without_a_class_definition(self):
        dex = bytearray(dex_with_class("Lcom/urtruck/app/SomeOtherClass;"))
        # A non-class reference string is not enough; class_def still points to the other type.
        classes = gate.dex_defined_classes(bytes(dex))
        self.assertNotIn(gate.SERVICE_DESCRIPTOR, classes)

    def test_rejects_truncated_dex(self):
        with self.assertRaisesRegex(ValueError, "truncated DEX"):
            gate.dex_defined_classes(b"dex\n")
