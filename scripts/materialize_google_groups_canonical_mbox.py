#!/usr/bin/env python3
"""Materialize the canonical manifest as one verified mbox file.

The source ZIP/MBOX files are read-only. Every selected message is verified
against the SHA-256 recorded during preparation before it is written.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import zipfile
from collections import OrderedDict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, Iterator


MBOX_SEPARATOR = b"From google-groups-backup@localhost Sat Jan 01 00:00:00 2000\n"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_mbox_messages(stream: BinaryIO) -> Iterator[tuple[int, bytes]]:
    current = io.BytesIO()
    seen_separator = False
    message_number = 0
    for line in stream:
        if line.startswith(b"From "):
            if seen_separator and current.tell() > 0:
                message_number += 1
                yield message_number, current.getvalue()
                current = io.BytesIO()
            seen_separator = True
            continue
        if seen_separator:
            current.write(line)
    if seen_separator and current.tell() > 0:
        message_number += 1
        yield message_number, current.getvalue()


@contextmanager
def open_mbox(source_archive: Path, mbox_path: str):
    if source_archive.suffix.lower() == ".mbox":
        if source_archive.name != Path(mbox_path).name:
            raise ValueError(f"MBOX path mismatch: {source_archive} != {mbox_path}")
        with source_archive.open("rb") as handle:
            yield handle
        return

    with zipfile.ZipFile(source_archive) as archive:
        with archive.open(mbox_path, "r") as handle:
            yield handle


def load_manifest(path: Path) -> list[dict]:
    required = {
        "dedup_key",
        "raw_sha256",
        "raw_bytes",
        "source_archive",
        "mbox_path",
        "mbox_message_number",
    }
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise ValueError(f"Canonical manifest is empty: {path}")
    missing = required - set(rows[0])
    if missing:
        raise ValueError(f"Canonical manifest is missing fields: {sorted(missing)}")

    seen: set[str] = set()
    for row in rows:
        key = row["dedup_key"]
        if not key or key in seen:
            raise ValueError(f"Duplicate or empty dedup_key: {key!r}")
        seen.add(key)
        row["mbox_message_number"] = int(row["mbox_message_number"])
        row["raw_bytes"] = int(row["raw_bytes"])
        source = Path(row["source_archive"]).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"Source archive not found: {source}")
        row["source_archive"] = str(source)
    return rows


def materialize(manifest: Path, output: Path, summary_path: Path) -> dict:
    rows = load_manifest(manifest)
    selected_by_source: OrderedDict[tuple[str, str], dict[int, dict]] = OrderedDict()
    for row in rows:
        source_key = (row["source_archive"], row["mbox_path"])
        by_number = selected_by_source.setdefault(source_key, {})
        number = row["mbox_message_number"]
        if number in by_number:
            raise ValueError(f"Duplicate source message reference: {source_key} #{number}")
        by_number[number] = row

    output.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_name(f"{output.name}.partial")
    if output.exists():
        raise FileExistsError(f"Output already exists: {output}")
    if partial.exists():
        raise FileExistsError(f"A partial output needs review: {partial}")

    written_hashes: list[str] = []
    written_bytes = 0
    try:
        with partial.open("xb") as destination:
            for (archive_name, mbox_path), by_number in selected_by_source.items():
                remaining = set(by_number)
                with open_mbox(Path(archive_name), mbox_path) as source:
                    for message_number, raw in iter_mbox_messages(source):
                        if message_number not in remaining:
                            continue
                        row = by_number[message_number]
                        actual_hash = hashlib.sha256(raw).hexdigest()
                        if actual_hash != row["raw_sha256"]:
                            raise ValueError(
                                f"Source hash mismatch for {row['dedup_key']}: "
                                f"{actual_hash} != {row['raw_sha256']}"
                            )
                        if len(raw) != row["raw_bytes"]:
                            raise ValueError(
                                f"Source size mismatch for {row['dedup_key']}: "
                                f"{len(raw)} != {row['raw_bytes']}"
                            )
                        if not raw.endswith(b"\n"):
                            raise ValueError(
                                f"Message does not end with a newline: {row['dedup_key']}"
                            )
                        destination.write(MBOX_SEPARATOR)
                        destination.write(raw)
                        written_hashes.append(actual_hash)
                        written_bytes += len(raw)
                        remaining.remove(message_number)
                if remaining:
                    raise ValueError(
                        f"MBOX ended before selected messages were found in {archive_name}: "
                        f"{sorted(remaining)[:10]}"
                    )
            destination.flush()
            os.fsync(destination.fileno())

        with partial.open("rb") as verification_stream:
            verified_hashes = [
                hashlib.sha256(raw).hexdigest()
                for _, raw in iter_mbox_messages(verification_stream)
            ]
        if verified_hashes != written_hashes:
            raise ValueError("The materialized MBOX failed the message-by-message verification")
        if len(written_hashes) != len(rows):
            raise ValueError(
                f"Materialized count mismatch: {len(written_hashes)} != {len(rows)}"
            )
        os.replace(partial, output)
    except Exception:
        # Preserve a partial file for forensic review; never overwrite or silently delete it.
        raise

    result = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "manifest": str(manifest),
        "manifest_sha256": sha256_file(manifest),
        "canonical_messages": len(rows),
        "canonical_raw_bytes": written_bytes,
        "output_mbox": str(output),
        "output_bytes": output.stat().st_size,
        "output_sha256": sha256_file(output),
        "source_files": sorted({row["source_archive"] for row in rows}),
    }
    summary_partial = summary_path.with_name(f"{summary_path.name}.partial")
    with summary_partial.open("x", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(summary_partial, summary_path)
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = materialize(
        Path(args.manifest).expanduser().resolve(),
        Path(args.output).expanduser().resolve(),
        Path(args.summary).expanduser().resolve(),
    )
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
