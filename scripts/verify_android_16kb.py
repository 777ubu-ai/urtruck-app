#!/usr/bin/env python3
"""Проверка ELF LOAD-сегментов 64-битных native библиотек в AAB/APK/AAR.
ZIP alignment проверяется отдельно на APK, ELF alignment — до загрузки в Play.
"""
import argparse
import struct
import zipfile


def verify_elf(data):
    if data[:4] != b"\x7fELF" or len(data) < 64:
        raise ValueError("invalid ELF header")
    if data[4] != 2 or data[5] not in (1, 2):
        raise ValueError("expected ELF64 with known endianness")
    endian = "<" if data[5] == 1 else ">"
    offset = struct.unpack_from(endian + "Q", data, 32)[0]
    entry_size, count = struct.unpack_from(endian + "HH", data, 54)
    if entry_size < 56 or not count or offset + entry_size * count > len(data):
        raise ValueError("invalid program header table")
    loads = 0
    for i in range(count):
        row = struct.unpack_from(endian + "IIQQQQQQ", data, offset + i * entry_size)
        if row[0] != 1:
            continue
        loads += 1
        alignment = row[7]
        if alignment < 16384 or alignment & (alignment - 1):
            raise ValueError(f"LOAD alignment {alignment} is not compatible with 16 KB")
        if (row[2] - row[3]) % 16384:
            raise ValueError("LOAD offset/address are not congruent modulo 16 KB")
    if not loads:
        raise ValueError("no LOAD segments")


def verify_archive(path):
    failures = []
    checked = 0
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith(".so") or not any(abi + "/" in name for abi in ("arm64-v8a", "x86_64")):
                continue
            checked += 1
            try:
                verify_elf(archive.read(name))
            except (ValueError, struct.error) as error:
                failures.append(f"{name}: {error}")
    if not checked:
        failures.append("archive contains no 64-bit native libraries")
    return checked, failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    args = parser.parse_args()
    checked, failures = verify_archive(args.archive)
    for failure in failures:
        print("FAIL:", failure)
    print(f"ELF 16 KB: checked={checked}, failures={len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
