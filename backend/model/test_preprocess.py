"""
Tests for Stage 1 (preprocess.py). Deliberately written with plain asserts,
not pytest — you may not have pytest installed everywhere you run this, and
these are simple enough not to need a test framework.

Run with:  python3 tests/test_preprocess.py
"""

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from preprocess import Tile, load_image_rgb, resize_max_side, stitch_tiles, tile_image


def make_synthetic_image(h: int, w: int) -> np.ndarray:
    """A fake 'aerial photo': gradient background + a few bright disks (fake hills).

    Deterministic and dependency-free (no internet, no sample data needed) —
    this is exactly the kind of stand-in you should reach for when testing
    CV code that doesn't yet have a real dataset to run against.
    """
    yy, xx = np.mgrid[0:h, 0:w]
    gradient = ((xx / w) * 255).astype(np.uint8)
    img = np.stack([gradient, gradient, gradient], axis=-1)
    rng = np.random.default_rng(42)
    for _ in range(5):
        cx, cy, r = rng.integers(0, w), rng.integers(0, h), rng.integers(40, 120)
        cv2.circle(img, (int(cx), int(cy)), int(r), (200, 160, 120), -1)
    return img


def test_load_image_rgb_roundtrip(tmp_path: Path):
    img = make_synthetic_image(120, 160)
    path = tmp_path / "test.png"
    # cv2.imwrite expects BGR, so convert before saving — mirroring what a
    # real capture pipeline does, and exercising the same conversion our
    # load function has to undo.
    cv2.imwrite(str(path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))

    loaded = load_image_rgb(str(path))
    assert loaded.shape == img.shape, f"shape mismatch: {loaded.shape} vs {img.shape}"
    assert loaded.dtype == np.uint8
    # Allow small diff from PNG compression rounding, but colors must be close —
    # if channel order were wrong this diff would be huge (avg ~85+), not tiny.
    diff = np.abs(loaded.astype(int) - img.astype(int)).mean()
    assert diff < 2.0, f"round-tripped image differs too much (mean diff {diff}) — check channel order"
    print("  load_image_rgb: RGB round-trip OK, mean pixel diff =", round(diff, 3))


def test_load_image_rgb_missing_file():
    try:
        load_image_rgb("/nonexistent/path.jpg")
        assert False, "should have raised FileNotFoundError"
    except FileNotFoundError:
        print("  load_image_rgb: correctly raises on missing file")


def test_resize_max_side_shrinks():
    img = make_synthetic_image(800, 1600)
    resized = resize_max_side(img, max_side=800)
    assert max(resized.shape[:2]) == 800, resized.shape
    # aspect ratio preserved (within 1px rounding)
    orig_ratio = 1600 / 800
    new_ratio = resized.shape[1] / resized.shape[0]
    assert abs(orig_ratio - new_ratio) < 0.01, (orig_ratio, new_ratio)
    print(f"  resize_max_side: 1600x800 -> {resized.shape[1]}x{resized.shape[0]}, ratio preserved")


def test_resize_max_side_noop_when_already_small():
    img = make_synthetic_image(200, 300)
    resized = resize_max_side(img, max_side=800)
    assert resized.shape == img.shape
    assert resized is img, "should return the same array, not a copy, when no resize is needed"
    print("  resize_max_side: no-op confirmed for already-small image")


def test_tile_image_covers_whole_image_no_gaps():
    h, w = 1000, 1300
    img = make_synthetic_image(h, w)
    tiles = tile_image(img, tile_size=512, overlap=64)

    assert len(tiles) > 1, "a 1000x1300 image with tile_size=512 must produce multiple tiles"

    # Build a coverage mask: mark every pixel touched by at least one tile.
    covered = np.zeros((h, w), dtype=bool)
    for t in tiles:
        th, tw = t.image.shape[:2]
        assert t.x + tw <= w and t.y + th <= h, "tile extends past image bounds"
        covered[t.y : t.y + th, t.x : t.x + tw] = True
    assert covered.all(), "tiling left uncovered pixels — there's a gap in the grid"
    print(f"  tile_image: {len(tiles)} tiles, full coverage confirmed, no gaps")


def test_tile_image_small_image_returns_single_tile():
    img = make_synthetic_image(300, 300)
    tiles = tile_image(img, tile_size=512, overlap=64)
    assert len(tiles) == 1
    assert tiles[0].x == 0 and tiles[0].y == 0
    assert np.array_equal(tiles[0].image, img)
    print("  tile_image: image smaller than tile_size returns unchanged as single tile")


def test_tile_image_rejects_bad_overlap():
    img = make_synthetic_image(300, 300)
    try:
        tile_image(img, tile_size=256, overlap=256)
        assert False, "should have raised ValueError for overlap >= tile_size"
    except ValueError:
        print("  tile_image: correctly rejects overlap >= tile_size")


def test_stitch_tiles_recovers_constant_field():
    """If every 'depth map' is the same constant value, stitching (whatever
    the blend weights do) must reproduce that same constant everywhere —
    this catches bugs where the feather weights don't sum to 1 and the
    output ends up scaled wrong in overlap regions."""
    h, w = 600, 800
    img = make_synthetic_image(h, w)
    tiles = tile_image(img, tile_size=300, overlap=50)
    constant_value = 7.5
    fake_depths = [np.full(t.image.shape[:2], constant_value, dtype=np.float32) for t in tiles]

    stitched = stitch_tiles(tiles, fake_depths, output_shape=(h, w))
    assert stitched.shape == (h, w)
    max_err = np.abs(stitched - constant_value).max()
    assert max_err < 1e-3, f"stitched output should be exactly {constant_value} everywhere, max error {max_err}"
    print(f"  stitch_tiles: constant field recovered exactly (max error {max_err:.2e})")


def test_stitch_tiles_blends_seam_smoothly():
    """Two adjacent tiles with different constant values should blend
    smoothly across the overlap, not jump abruptly — verifies the feather
    weighting is actually doing something, not just averaging everything."""
    h, w = 300, 600
    img = make_synthetic_image(h, w)
    tiles = tile_image(img, tile_size=350, overlap=100)
    assert len(tiles) == 2, f"expected exactly 2 tiles for this setup, got {len(tiles)}"

    fake_depths = [np.full(t.image.shape[:2], 0.0, dtype=np.float32) for t in tiles]
    fake_depths[1][:] = 10.0  # second tile is a completely different value

    stitched = stitch_tiles(tiles, fake_depths, output_shape=(h, w))
    # Sample a horizontal line through the middle and check it's monotonic
    # (smoothly increasing) across the seam, not a hard step.
    row = stitched[h // 2, :]
    diffs = np.diff(row)
    assert (diffs >= -1e-3).all(), "stitched seam is not monotonic — blending isn't smooth"
    # And the jump shouldn't be a single-pixel cliff — check the transition
    # spans a meaningful number of columns, not 1-2 pixels.
    transition_cols = np.sum((row > 0.5) & (row < 9.5))
    assert transition_cols > 20, f"seam transition too abrupt ({transition_cols} px) — feathering not working"
    print(f"  stitch_tiles: seam blends smoothly over {transition_cols}px, no hard edge")


def run_all():
    import tempfile

    tests = [
        (test_load_image_rgb_missing_file, ()),
        (test_resize_max_side_shrinks, ()),
        (test_resize_max_side_noop_when_already_small, ()),
        (test_tile_image_covers_whole_image_no_gaps, ()),
        (test_tile_image_small_image_returns_single_tile, ()),
        (test_tile_image_rejects_bad_overlap, ()),
        (test_stitch_tiles_recovers_constant_field, ()),
        (test_stitch_tiles_blends_seam_smoothly, ()),
    ]
    print(f"Running {len(tests) + 1} tests...\n")

    with tempfile.TemporaryDirectory() as tmp:
        test_load_image_rgb_roundtrip(Path(tmp))

    for fn, args in tests:
        fn(*args)

    print("\nAll tests passed.")


if __name__ == "__main__":
    run_all()