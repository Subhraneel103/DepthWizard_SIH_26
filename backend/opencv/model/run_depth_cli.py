"""
Run the REAL depth model end-to-end on one image. This is the script you run
in Google Colab (or any machine with a GPU / enough RAM) — it's the actual
verification step for HFDepthAnythingV2, which nothing in my sandbox could
test.

Usage:
    python3 scripts/run_depth_cli.py path/to/image.jpg
    python3 scripts/run_depth_cli.py path/to/image.jpg --model-size base --tile-size 384

Outputs (next to the input image, unless --out-dir is given):
    <name>_depth_raw.npy    — the raw float32 relative-elevation array (for calibration later)
    <name>_depth_view.png   — a min-max-normalized grayscale PNG (for eyeballing only)

WHAT TO ACTUALLY CHECK when you run this (don't just check it didn't crash):
  1. Open the _depth_view.png next to the original photo. Tall things (buildings,
     trees, poles) should look BRIGHT (high elevation); the ground/floor should
     look comparatively DARK. If it's inverted — tall things look dark, ground
     looks bright — the sign-flip in depth_infer.to_relative_elevation is wrong
     for the checkpoint you're using, and you need to flip it back.
  2. Check that structure roughly matches the photo: a building's outline should
     be visible as a distinct region, not random noise.
"""

import argparse
import sys
import time
from pathlib import Path

import cv2
import numpy as np

_OPENCV_ROOT = str(Path(__file__).resolve().parent.parent)
if _OPENCV_ROOT not in sys.path:
    sys.path.insert(0, _OPENCV_ROOT)

from model.depth_infer import get_model, normalize_for_display, run_depth_pipeline
from model.preprocess import load_image_rgb, resize_max_side


def main():
    parser = argparse.ArgumentParser(description="Run Depth Anything V2 on one image and save the result.")
    parser.add_argument("image_path", type=str, help="Path to an input JPG/PNG")
    parser.add_argument("--model-size", choices=["small", "base", "large"], default="small")
    parser.add_argument("--tile-size", type=int, default=512)
    parser.add_argument("--overlap", type=int, default=64)
    parser.add_argument("--max-side", type=int, default=2048, help="Resize longer side down to this before tiling")
    parser.add_argument("--out-dir", type=str, default=None, help="Defaults to the input image's own directory")
    args = parser.parse_args()

    image_path = Path(args.image_path)
    out_dir = Path(args.out_dir) if args.out_dir else image_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading image: {image_path}")
    image = load_image_rgb(str(image_path))
    image = resize_max_side(image, max_side=args.max_side)
    print(f"  -> {image.shape[1]}x{image.shape[0]} after resize")

    print(f"Loading model: {args.model_size} (this downloads weights on first run, ~25MB-1.3GB depending on size)")
    t0 = time.monotonic()
    model = get_model(args.model_size)
    print(f"  -> loaded in {time.monotonic() - t0:.1f}s")

    print("Running inference...")
    t0 = time.monotonic()
    depth = run_depth_pipeline(image, model, tile_size=args.tile_size, overlap=args.overlap)
    print(f"  -> done in {time.monotonic() - t0:.1f}s")
    print(f"  -> relative elevation range: [{depth.min():.3f}, {depth.max():.3f}]")

    raw_path = out_dir / f"{image_path.stem}_depth_raw.npy"
    np.save(raw_path, depth)
    print(f"Saved raw depth array: {raw_path}")

    view = normalize_for_display(depth)
    view_path = out_dir / f"{image_path.stem}_depth_view.png"
    cv2.imwrite(str(view_path), view)  # single-channel, no BGR/RGB conversion needed
    print(f"Saved viewable PNG: {view_path}")
    print("\nNow go open that PNG and check: do TALL things look BRIGHT? (see docstring for what to verify)")


if __name__ == "__main__":
    main()
