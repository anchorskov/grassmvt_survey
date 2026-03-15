#!/usr/bin/env python3
# scripts/optimize-card-art.py
from pathlib import Path

from PIL import Image, ImageOps


SOURCE_DIR = Path("/mnt/c/Users/ancho/OneDrive/Documents/grassrootsmvt_assets")
OUTPUT_DIR = Path("public/assets/cards")
CARD_FILES = ("survey", "townhall", "continue", "account")
OUTPUT_SIZE = (800, 800)
WEBP_QUALITY = 68


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for stem in CARD_FILES:
        src_path = SOURCE_DIR / f"{stem}.png"
        out_path = OUTPUT_DIR / f"{stem}.webp"

        with Image.open(src_path) as image:
            fitted = ImageOps.fit(image.convert("L"), OUTPUT_SIZE, method=Image.Resampling.LANCZOS)
            fitted.save(out_path, format="WEBP", quality=WEBP_QUALITY, method=6)

        print(f"{src_path} -> {out_path}")


if __name__ == "__main__":
    main()
