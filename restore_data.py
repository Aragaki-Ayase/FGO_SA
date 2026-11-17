"""Restore the bundled offline data on Python 3.11+."""
import hashlib
import io
import json
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parent
folder = root / "offline-data"
manifest = json.loads((folder / "manifest.json").read_text())
chunks = []
for part in manifest["parts"]:
    content = (folder / part["name"]).read_bytes()
    if hashlib.sha256(content).hexdigest() != part["sha256"]:
        raise ValueError("Checksum mismatch: " + part["name"])
    chunks.append(content)
archive = b"".join(chunks)
if hashlib.sha256(archive).hexdigest() != manifest["sha256"]:
    raise ValueError("Archive checksum mismatch")
with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
    for member in tar.getmembers():
        target = (root / member.name).resolve()
        if not target.is_relative_to(root / "data") or not (member.isfile() or member.isdir()):
            raise ValueError("Unsafe archive member: " + member.name)
        if member.isfile() and target.exists():
            current = target.read_bytes()
            with tar.extractfile(member) as source:
                if current != source.read():
                    raise ValueError("Existing file differs; back it up first: " + str(target))
    tar.extractall(root)
print("Offline data restored to", root / "data")
