"""
Tests for Stage 2 (depth_infer.py) — specifically the parts that DON'T need
torch/transformers/a GPU: the tiling->predict->stitch orchestration (using
DummyDepthModel), and the inverse-depth sign flip (pure NumPy).

HFDepthAnythingV2 itself is NOT tested here — it needs real model weights
and a GPU-capable environment. That's verified separately, by you, in Colab
(see scripts/run_depth_cli.py). Don't mistake "these tests pass" for "the
real model works" — they test different, non-overlapping parts of this file.

Run with: python3 tests/test_depth_infer.py
"""

import sys
from pathlib import Path

import numpy as np

_OPENCV_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if _OPENCV_ROOT not in sys.path:
    sys.path.insert(0, _OPENCV_ROOT)

from model.depth_infer import DummyDepthModel, run_depth_pipeline, to_relative_elevation


def make_synthetic_image(h: int, w: int) -> np.ndarray:
    """Same synthetic-image approach as test_preprocess.py — a gradient with
    a few bright disks, so DummyDepthModel (which returns pixel brightness)
    has non-uniform, checkable structure to work with."""
    yy, xx = np.mgrid[0:h, 0:w]
    gradient = ((xx / w) * 255).astype(np.uint8)
    img = np.stack([gradient, gradient, gradient], axis=-1)
    return img


def test_to_relative_elevation_flips_ordering():
    """The core correctness property: whatever was highest in inverse-depth
    (closest to camera) must become LOWEST in relative elevation, and vice
    versa. This is the exact bug that would flip a whole terrain upside down
    if it were wrong."""
    inverse_depth = np.array([[1.0, 5.0], [3.0, 2.0]], dtype=np.float32)
    elevation = to_relative_elevation(inverse_depth)

    # The pixel that was highest (5.0, closest to camera) must now be lowest.
    assert np.argmax(inverse_depth) == np.argmin(elevation)
    # The pixel that was lowest (1.0, farthest) must now be highest.
    assert np.argmin(inverse_depth) == np.argmax(elevation)
    print("  to_relative_elevation: ordering correctly reversed (closest <-> highest)")


def test_to_relative_elevation_is_pure_negation():
    inverse_depth = np.array([2.0, -3.5, 0.0], dtype=np.float32)
    elevation = to_relative_elevation(inverse_depth)
    assert np.allclose(elevation, [-2.0, 3.5, 0.0])
    print("  to_relative_elevation: confirmed simple negation, no unexpected rescaling")


def test_run_depth_pipeline_single_tile_matches_direct_predict():
    """For an image small enough to be a single tile, running it through the
    full pipeline (tile -> predict -> stitch) must give the SAME result as
    calling model.predict() directly — if it doesn't, tiling/stitching is
    introducing distortion even in the trivial no-tiling case."""
    img = make_synthetic_image(300, 300)
    model = DummyDepthModel()

    direct = model.predict(img)
    piped = run_depth_pipeline(img, model, tile_size=512, overlap=64)

    assert piped.shape == direct.shape
    assert np.allclose(piped, direct, atol=1e-3), "single-tile pipeline output should match direct predict() exactly"
    print("  run_depth_pipeline: single-tile case matches direct predict() call")


def test_run_depth_pipeline_multi_tile_preserves_shape_and_range():
    """For a genuinely multi-tile image, the stitched output must be the
    same shape as the input and stay within a sane value range — this is
    the same kind of end-to-end shape check as Stage 1's coverage test,
    just one layer up the stack."""
    h, w = 900, 1400
    img = make_synthetic_image(h, w)
    model = DummyDepthModel()

    result = run_depth_pipeline(img, model, tile_size=512, overlap=64)

    assert result.shape == (h, w), f"expected {(h, w)}, got {result.shape}"
    # DummyDepthModel returns grayscale means in [0, 255], so the stitched
    # (weighted-average) output must stay within that same range.
    assert 0.0 <= result.min() and result.max() <= 255.0, (
        f"stitched values out of expected range: [{result.min()}, {result.max()}]"
    )
    print(f"  run_depth_pipeline: {h}x{w} multi-tile output has correct shape and value range")


def test_run_depth_pipeline_gradient_direction_preserved():
    """The synthetic image is a left-to-right brightness gradient. After
    tiling->predicting->stitching, the LEFT side of the output must still be
    darker (lower) than the RIGHT side — catches bugs where tile stitching
    order or positioning silently scrambles the image."""
    img = make_synthetic_image(600, 1200)
    model = DummyDepthModel()
    result = run_depth_pipeline(img, model, tile_size=512, overlap=64)

    left_mean = result[:, :100].mean()
    right_mean = result[:, -100:].mean()
    assert left_mean < right_mean, f"gradient direction lost: left={left_mean:.1f}, right={right_mean:.1f}"
    print(f"  run_depth_pipeline: gradient direction preserved (left={left_mean:.1f} < right={right_mean:.1f})")


def run_all():
    tests = [
        test_to_relative_elevation_flips_ordering,
        test_to_relative_elevation_is_pure_negation,
        test_run_depth_pipeline_single_tile_matches_direct_predict,
        test_run_depth_pipeline_multi_tile_preserves_shape_and_range,
        test_run_depth_pipeline_gradient_direction_preserved,
    ]
    print(f"Running {len(tests)} tests (no torch/GPU required)...\n")
    for fn in tests:
        fn()
    print("\nAll tests passed.")
    print("\nNOTE: HFDepthAnythingV2 (the real model) is NOT covered by these tests.")
    print("Run scripts/run_depth_cli.py in Colab to verify that part.")


if __name__ == "__main__":
    run_all()