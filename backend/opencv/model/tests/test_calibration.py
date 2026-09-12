"""
Tests for calibration.py. Pure numpy/scipy — no rasterio, no network, no
model. Run with: python3 tests/test_calibration.py
"""

import sys
from pathlib import Path

import numpy as np

_OPENCV_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if _OPENCV_ROOT not in sys.path:
    sys.path.insert(0, _OPENCV_ROOT)

from model.calibration import (
    CalibrationFit,
    InsufficientPointsError,
    apply_calibration,
    fit_scale_shift,
    sample_at_points,
)


def test_fit_recovers_exact_line_with_no_noise():
    """If the relationship really is elevation = 3.5*x + 100 exactly, the
    fit must recover 3.5 and 100 (to floating-point precision), and R²
    must be essentially 1.0 — this is the sanity-check every calibration
    routine has to pass before you trust it on noisy real data."""
    true_scale, true_shift = 3.5, 100.0
    relative_values = np.array([0.0, 1.0, 2.0, 5.0, 10.0])
    true_elevations = true_scale * relative_values + true_shift

    fit = fit_scale_shift(relative_values, true_elevations)

    assert abs(fit.scale - true_scale) < 1e-9
    assert abs(fit.shift - true_shift) < 1e-9
    assert fit.r_squared > 0.999999
    assert fit.rmse < 1e-9
    print(f"  fit_scale_shift: exact line recovered — {fit.describe()}")


def test_fit_handles_negative_scale():
    """The scale/shift ambiguity discussion flagged that the sign can go
    either way depending on convention — the fit itself must not assume
    scale is positive. This directly guards the inverse-depth bug we fixed
    in depth_infer.py: if that sign flip were ever wrong or missing, THIS
    fit is what would have to silently absorb a negative scale to compensate,
    and a fit that only worked for positive scale would fail exactly then."""
    relative_values = np.array([0.0, 1.0, 2.0, 3.0])
    true_elevations = np.array([50.0, 40.0, 30.0, 20.0])  # decreasing -> negative scale

    fit = fit_scale_shift(relative_values, true_elevations)
    assert fit.scale < 0, f"expected negative scale for a decreasing relationship, got {fit.scale}"
    assert fit.r_squared > 0.999
    print(f"  fit_scale_shift: correctly handles negative scale — {fit.describe()}")


def test_fit_with_realistic_noise():
    """Real GCPs/SRTM samples won't lie on a perfect line. Add Gaussian
    noise and check the fit still recovers approximately the right scale
    and shift, with R² correspondingly lower but not collapsed."""
    rng = np.random.default_rng(42)
    true_scale, true_shift = -12.0, 250.0
    relative_values = rng.uniform(0, 20, size=30)
    noise = rng.normal(0, 2.0, size=30)  # 2m std noise, realistic for SRTM vs. true elevation
    true_elevations = true_scale * relative_values + true_shift + noise

    fit = fit_scale_shift(relative_values, true_elevations)

    assert abs(fit.scale - true_scale) < 1.0, f"scale {fit.scale} too far from true {true_scale}"
    assert abs(fit.shift - true_shift) < 5.0, f"shift {fit.shift} too far from true {true_shift}"
    assert fit.r_squared > 0.9, f"R² unexpectedly low for this noise level: {fit.r_squared}"
    print(f"  fit_scale_shift: noisy data gives a close, honest fit — {fit.describe()}")


def test_fit_rejects_too_few_points():
    try:
        fit_scale_shift(np.array([1.0]), np.array([5.0]))
        assert False, "should have raised InsufficientPointsError for a single point"
    except InsufficientPointsError:
        print("  fit_scale_shift: correctly rejects a single calibration point")


def test_fit_rejects_mismatched_lengths():
    try:
        fit_scale_shift(np.array([1.0, 2.0, 3.0]), np.array([5.0, 6.0]))
        assert False, "should have raised ValueError for mismatched array lengths"
    except ValueError:
        print("  fit_scale_shift: correctly rejects mismatched-length inputs")


def test_apply_calibration_matches_fit_on_training_points():
    """apply_calibration on the exact relative values used to fit the line
    must reproduce the true elevations (for the no-noise case) — this
    catches transcription bugs like swapping scale/shift or applying the
    inverse transform by mistake."""
    relative_values = np.array([0.0, 2.0, 4.0])
    true_elevations = np.array([10.0, 14.0, 18.0])  # scale=2, shift=10
    fit = fit_scale_shift(relative_values, true_elevations)

    applied = apply_calibration(relative_values, fit)
    assert np.allclose(applied, true_elevations, atol=1e-4)
    print("  apply_calibration: reproduces training points exactly, scale/shift not swapped")


def test_apply_calibration_on_full_array():
    """apply_calibration needs to work on a full 2D depth map, not just a
    1D list of sample points — this is what actually gets called on the
    Stage 2 output."""
    fit = CalibrationFit(scale=2.0, shift=-5.0, r_squared=1.0, rmse=0.0, n_points=10)
    relative_depth = np.array([[0.0, 1.0], [2.0, 3.0]], dtype=np.float32)

    absolute = apply_calibration(relative_depth, fit)
    expected = np.array([[-5.0, -3.0], [-1.0, 1.0]], dtype=np.float32)
    assert absolute.shape == relative_depth.shape
    assert np.allclose(absolute, expected)
    print("  apply_calibration: correctly vectorizes over a full 2D array")


def test_sample_at_points_extracts_correct_values():
    array = np.array([[10, 20, 30], [40, 50, 60], [70, 80, 90]], dtype=np.float32)
    points = [(0, 0), (1, 2), (2, 1)]  # -> 10, 60, 80

    values = sample_at_points(array, points)
    assert np.allclose(values, [10, 60, 80])
    print("  sample_at_points: correctly extracts values at given (row, col) positions")


def test_sample_at_points_rejects_out_of_bounds():
    array = np.zeros((5, 5), dtype=np.float32)
    try:
        sample_at_points(array, [(2, 2), (10, 10)])
        assert False, "should have raised IndexError for an out-of-bounds point"
    except IndexError as e:
        assert "outside the array bounds" in str(e)
        print("  sample_at_points: correctly rejects out-of-bounds points with a clear message")


def run_all():
    tests = [
        test_fit_recovers_exact_line_with_no_noise,
        test_fit_handles_negative_scale,
        test_fit_with_realistic_noise,
        test_fit_rejects_too_few_points,
        test_fit_rejects_mismatched_lengths,
        test_apply_calibration_matches_fit_on_training_points,
        test_apply_calibration_on_full_array,
        test_sample_at_points_extracts_correct_values,
        test_sample_at_points_rejects_out_of_bounds,
    ]
    print(f"Running {len(tests)} tests...\n")
    for fn in tests:
        fn()
    print("\nAll tests passed.")


if __name__ == "__main__":
    run_all()