"""
Stage 1: Preprocessing (OpenCV / NumPy)

Responsibilities, matching the design doc's pipeline stage 4:
  - load an image off disk as RGB (OpenCV loads BGR — this is the #1 bug source)
  - resize oversized images down to something a depth model can handle in one pass
  - tile large images into overlapping patches for per-tile inference
  - stitch per-tile outputs back into a single full-resolution map, blending seams

Runs entirely on CPU — no PyTorch dependency in this file on purpose, so it can be
unit-tested without a GPU or any model weights.
"""

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Tile:
    """A single tile cut from a larger image, with its position in the original."""

    image: np.ndarray  # (tile_h, tile_w, 3) uint8, RGB
    x: int              # left edge, in original-image pixel coordinates
    y: int               # top edge, in original-image pixel coordinates


def load_image_rgb(path: str) -> np.ndarray:
    """Load an image from disk and return it as RGB uint8, shape (H, W, 3).

    OpenCV's imread returns BGR by default — every downstream consumer
    (HuggingFace processors, PyTorch models, matplotlib) expects RGB, so we
    convert immediately and never think about channel order again.
    """
    img_bgr = cv2.imread(path, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise FileNotFoundError(f"OpenCV could not read image at: {path}")
    return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)


def resize_max_side(image: np.ndarray, max_side: int) -> np.ndarray:
    """Resize so the longer side equals max_side, preserving aspect ratio.

    Uses INTER_AREA when shrinking (best quality for downscaling) and
    INTER_CUBIC when enlarging (smoother than the default linear for upscales).
    No-op if the image already fits.
    """
    h, w = image.shape[:2]
    longer_side = max(h, w)
    if longer_side <= max_side:
        return image

    scale = max_side / longer_side
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_CUBIC
    return cv2.resize(image, (new_w, new_h), interpolation=interpolation)


def tile_image(image: np.ndarray, tile_size: int = 512, overlap: int = 64) -> list[Tile]:
    """Cut an image into overlapping square-ish tiles.

    Overlap exists so that when we stitch depth predictions back together,
    we have room to blend across the seam instead of getting a hard edge
    where two independently-inferred tiles meet.

    Tiles at the right/bottom edges are clipped to the image bounds rather
    than padded — the depth model handles arbitrary aspect ratios fine, and
    padding would introduce fake content the model might try to interpret.
    """
    if overlap >= tile_size:
        raise ValueError("overlap must be smaller than tile_size")

    h, w = image.shape[:2]
    stride = tile_size - overlap

    # Image smaller than one tile: return it whole, no tiling needed.
    if h <= tile_size and w <= tile_size:
        return [Tile(image=image, x=0, y=0)]

    tiles: list[Tile] = []
    y = 0
    while y < h:
        x = 0
        tile_h = min(tile_size, h - y)
        while x < w:
            tile_w = min(tile_size, w - x)
            tiles.append(Tile(image=image[y : y + tile_h, x : x + tile_w], x=x, y=y))
            if x + tile_w >= w:
                break
            x += stride
        if y + tile_h >= h:
            break
        y += stride
    return tiles


def stitch_tiles(tiles: list[Tile], depth_maps: list[np.ndarray], output_shape: tuple[int, int]) -> np.ndarray:
    """Reassemble per-tile depth predictions into one full-resolution map.

    Each tile's depth map is placed at its original (x, y) position. Where
    tiles overlap, we blend with linear feathering (weight fades to 0 at a
    tile's own edge) so the seam doesn't show as a visible discontinuity —
    a hard cut would show up as a step in elevation once you build a mesh.

    depth_maps[i] must be the same (h, w) as tiles[i].image.
    """
    if len(tiles) != len(depth_maps):
        raise ValueError("tiles and depth_maps must have the same length")

    out_h, out_w = output_shape
    accumulator = np.zeros((out_h, out_w), dtype=np.float32)
    weight_sum = np.zeros((out_h, out_w), dtype=np.float32)

    for tile, depth in zip(tiles, depth_maps):
        th, tw = depth.shape[:2]
        weight = _feather_weight(th, tw)
        accumulator[tile.y : tile.y + th, tile.x : tile.x + tw] += depth.astype(np.float32) * weight
        weight_sum[tile.y : tile.y + th, tile.x : tile.x + tw] += weight

    # Guard against division by zero in any pixel that (shouldn't, but could) end up uncovered.
    weight_sum[weight_sum == 0] = 1.0
    return accumulator / weight_sum


def _feather_weight(h: int, w: int) -> np.ndarray:
    """Triangular weight window (rises toward the center, falls toward the edges),
    outer-producted into a 2D weight map.

    IMPORTANT: this must never hit exactly 0.0 anywhere. A pixel that's only
    covered by a single tile (e.g. the true outer border of the whole image,
    which has no neighboring tile to blend with) would get a total weight of
    zero and come out as 0 instead of its real value. An earlier version of
    this function used a ramp that touched 0.0 exactly at each tile edge —
    caught by test_stitch_tiles_recovers_constant_field, which stitched a
    known-constant depth map and found the corners had been zeroed out.
    """

    def tri(n: int) -> np.ndarray:
        if n == 1:
            return np.ones(1, dtype=np.float32)
        idx = np.arange(n, dtype=np.float32)
        center = (n - 1) / 2.0
        # +1 in the denominator is what keeps this strictly positive even at idx=0 or n-1.
        return 1.0 - np.abs(idx - center) / (center + 1.0)

    return np.outer(tri(h), tri(w))