#!/usr/bin/env python3
"""Fail the QA build when the merged FCM service has no class in the APK DEX."""

from __future__ import annotations

import argparse
import re
import struct
import subprocess
import zipfile
from pathlib import Path


SERVICE_DESCRIPTOR = "Lcom/urtruck/app/UrTruckFirebaseMessagingService;"
REQUIRED_CLASSES = (
    SERVICE_DESCRIPTOR,
    "Lcom/urtruck/app/UrTruckBadgePolicy;",
    "Lcom/urtruck/app/UrTruckNotificationBadgeStore;",
    "Lcom/urtruck/app/UrTruckNotificationBadgeModule;",
    "Lcom/urtruck/app/UrTruckNotificationBadgePackage;",
    "Lcom/urtruck/app/UrTruckSystemBarsModule;",
    "Lcom/urtruck/app/UrTruckSystemBarsPackage;",
)


def _u32(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise ValueError("DEX offset outside file")
    return struct.unpack_from("<I", data, offset)[0]


def _uleb128(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    shift = 0
    while offset < len(data) and shift <= 28:
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, offset
        shift += 7
    raise ValueError("invalid DEX string length")


def dex_defined_classes(data: bytes) -> set[str]:
    """Read descriptors from DEX class_def_item entries, not arbitrary strings."""
    if not data.startswith(b"dex\n") or len(data) < 112:
        raise ValueError("invalid or truncated DEX file")
    string_count, string_offset = _u32(data, 56), _u32(data, 60)
    type_count, type_offset = _u32(data, 64), _u32(data, 68)
    class_count, class_offset = _u32(data, 96), _u32(data, 100)
    if string_offset + string_count * 4 > len(data):
        raise ValueError("DEX string_ids outside file")
    if type_offset + type_count * 4 > len(data):
        raise ValueError("DEX type_ids outside file")
    if class_offset + class_count * 32 > len(data):
        raise ValueError("DEX class_defs outside file")

    string_data_offsets = [_u32(data, string_offset + i * 4) for i in range(string_count)]
    type_descriptors = [_u32(data, type_offset + i * 4) for i in range(type_count)]
    result: set[str] = set()
    for index in range(class_count):
        class_index = _u32(data, class_offset + index * 32)
        if class_index >= len(type_descriptors):
            raise ValueError("DEX class_def references unknown type")
        string_index = type_descriptors[class_index]
        if string_index >= len(string_data_offsets):
            raise ValueError("DEX type references unknown descriptor")
        cursor = string_data_offsets[string_index]
        _, cursor = _uleb128(data, cursor)  # UTF-16 length
        terminator = data.find(b"\0", cursor)
        if terminator < 0:
            raise ValueError("unterminated DEX class descriptor")
        result.add(data[cursor:terminator].decode("ascii"))
    return result


def _service_manifest_block(xmltree: str) -> str:
    marker = 'A: android:name(0x01010003)="com.urtruck.app.UrTruckFirebaseMessagingService"'
    location = xmltree.find(marker)
    if location < 0:
        raise ValueError("merged APK manifest does not declare the UrTruck FCM service")
    start = xmltree.rfind("E: service", 0, location)
    if start < 0:
        raise ValueError("FCM service name is outside a service declaration")
    ends = [pos for pos in (xmltree.find("E: service", location), xmltree.find("E: activity", location)) if pos >= 0]
    end = min(ends) if ends else len(xmltree)
    block = xmltree[start:end]
    if "com.google.firebase.MESSAGING_EVENT" not in block:
        raise ValueError("UrTruck service is missing the Firebase messaging intent")
    if not re.search(r"A: android:exported\([^\n]*\)=\(type 0x12\)0x0", block):
        raise ValueError("UrTruck FCM service must remain non-exported")
    return block


def verify_apk(apk: Path, expected_package: str, aapt: str) -> None:
    badging = subprocess.check_output([aapt, "dump", "badging", str(apk)], text=True)
    match = re.search(r"^package: name='([^']+)'", badging, re.MULTILINE)
    if not match or match.group(1) != expected_package:
        raise ValueError(f"APK package mismatch: expected {expected_package}")
    xmltree = subprocess.check_output([aapt, "dump", "xmltree", str(apk), "AndroidManifest.xml"], text=True)
    _service_manifest_block(xmltree)

    with zipfile.ZipFile(apk) as archive:
        dex_names = [name for name in archive.namelist() if re.fullmatch(r"classes(?:\d+)?\.dex", name)]
        if not dex_names:
            raise ValueError("APK contains no classes*.dex")
        defined: set[str] = set()
        for name in dex_names:
            defined.update(dex_defined_classes(archive.read(name)))
    missing = [descriptor for descriptor in REQUIRED_CLASSES if descriptor not in defined]
    if missing:
        raise ValueError("APK DEX is missing app-owned Android classes: " + ", ".join(missing))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path)
    parser.add_argument("--expected-package", required=True)
    parser.add_argument("--aapt", required=True)
    args = parser.parse_args()
    verify_apk(args.apk, args.expected_package, args.aapt)
    print("PASS: package, non-exported merged FCM service and app-owned DEX classes verified")


if __name__ == "__main__":
    main()
