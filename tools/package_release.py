"""Build a deployable DEVFORGE release zip.

Usage:
    python tools/package_release.py

Output:
    release/devforge-<version>.zip

The zip contains a top-level `devforge/` folder, so on the server:
    unzip -o devforge-<version>.zip -d /opt
    # -> /opt/devforge
"""
from __future__ import annotations

import json
import stat
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
OUT_DIR = ROOT / "release"
OUT_DIR.mkdir(exist_ok=True)
TARGET = OUT_DIR / f"devforge-{VERSION}.zip"

FILES = [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".env.example",
    "README.md",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "Dockerfile",
    "docker-compose.yml",
    "Caddyfile",
]
TREES = [
    "dist",
    "server",
    "deploy",
    "docs",
    "src",
    "public",
    "tools",
]


def add_file(zf: zipfile.ZipFile, source: Path, arcname: Path) -> None:
    if not source.exists():
        print(f"  skip missing: {source.relative_to(ROOT)}")
        return
    info = zipfile.ZipInfo(str(arcname).replace("\\", "/"))
    info.date_time = (2026, 1, 1, 0, 0, 0)
    data = source.read_bytes()
    if source.suffix == ".sh":
        info.external_attr = (stat.S_IFREG | 0o755) << 16
    else:
        info.external_attr = (stat.S_IFREG | 0o644) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    zf.writestr(info, data)


def main() -> None:
    print(f"Packaging DEVFORGE v{VERSION} -> {TARGET}")
    with zipfile.ZipFile(TARGET, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for name in FILES:
            add_file(zf, ROOT / name, Path("devforge") / name)

        for tree in TREES:
            base = ROOT / tree
            if not base.exists():
                print(f"  skip missing tree: {tree}")
                continue
            for path in sorted(base.rglob("*")):
                if not path.is_file():
                    continue
                if "node_modules" in path.parts or "__pycache__" in path.parts:
                    continue
                add_file(zf, path, Path("devforge") / path.relative_to(ROOT))

    size = TARGET.stat().st_size / 1024 / 1024
    print(f"Done: {TARGET}")
    print(f"Size: {size:.2f} MB")
    print("\nUpload to the server, then:")
    print(f"  sudo mkdir -p /opt && sudo unzip -o {TARGET.name} -d /opt")
    print("  sudo bash /opt/devforge/deploy/install-ubuntu.sh")


if __name__ == "__main__":
    main()
