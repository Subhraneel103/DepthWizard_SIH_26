"""
Visual sanity check for Stage 1. Not a unit test — just a script you run
once to *look* at what tile_image() is actually doing, since a passing
assertion doesn't always mean the output looks sane to a human.

Run with: python3 scripts/visualize_tiles.py
Writes: sample_data/tiled_preview.png
"""

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from preprocess import tile_image

ROOT = Path(__file__).resolve().parent.parent


def make_synthetic_scene(h: int, w: int) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w]
    gradient = ((xx / w) * 200 + 30).astype(np.uint8)
    img = np.stack([gradient, gradient, gradient], axis=-1)
    rng = np.random.default_rng(7)
    for _ in range(6):
        cx, cy, r = rng.integers(0, w), rng.integers(0, h), rng.integers(50, 150)
        color = tuple(int(c) for c in rng.integers(100, 255, size=3))
        cv2.circle(img, (int(cx), int(cy)), int(r), color, -1)
    return img


def draw_tile_grid(img: np.ndarray, tile_size: int, overlap: int) -> np.ndarray:
    tiles = tile_image(img, tile_size=tile_size, overlap=overlap)
    preview = img.copy()
    colors = [(255, 0, 0), (0, 200, 0), (0, 100, 255), (255, 0, 255)]
    for i, t in enumerate(tiles):
        h, w = t.image.shape[:2]
        color = colors[i % len(colors)]
        cv2.rectangle(preview, (t.x, t.y), (t.x + w - 1, t.y + h - 1), color, 3)
        label = f"{i}"
        cv2.putText(preview, label, (t.x + 8, t.y + 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
    print(f"{len(tiles)} tiles for a {img.shape[1]}x{img.shape[0]} image "
          f"(tile_size={tile_size}, overlap={overlap})")
    return preview


if __name__ == "__main__":
    scene = make_synthetic_scene(900, 1400)
    preview = draw_tile_grid(scene, tile_size=512, overlap=64)

    out_path = ROOT / "sample_data" / "tiled_preview.png"
    out_path.parent.mkdir(exist_ok=True)
    cv2.imwrite(str(out_path), cv2.cvtColor(preview, cv2.COLOR_RGB2BGR))
    print(f"Saved preview to {out_path}")