"""
Stage 3a: Calibration math — relative depth -> absolute elevation.

This file knows nothing about GeoTIFFs, SRTM, or coordinate systems. It only
knows: "given some (relative_value, true_elevation) pairs, fit a line
through them, and apply that line to a whole array." That's genuinely all
calibration IS, mathematically — see the scale/shift ambiguity explanation
from earlier: elevation = a * relative_value + b, and this file's whole job
is finding a and b.

Split out from geo_calibration.py (which reads GeoTIFFs and fetches SRTM)
for the same reason preprocess.py was split from depth_infer.py: this half
has zero exotic dependencies (just numpy + scipy, both in any base Python
env) and is fully unit-tested here; the geospatial I/O half needs rasterio
and pyproj, which aren't installed in my sandbox, so that part is written
carefully but verified by you, not me.
"""

from dataclasses import dataclass

import numpy as np
from scipy import stats


class InsufficientPointsError(ValueError):
    """Raised when fewer than 2 calibration points are given — you cannot
    fit a line through fewer than 2 points, full stop."""


@dataclass
class CalibrationFit:
    """The result of fitting elevation = scale * relative_value + shift.

    r_squared and rmse are both computed on the SAME points used for
    fitting (there's usually no held-out data for GCPs — you only have as
    many points as someone clicked). Treat them as "how well the points you
    gave it agree with a straight line," not as a generalization guarantee:
    3 GCPs will always fit "well" by this measure even if the whole model
    is subtly wrong. More points and points spread across the elevation
    range make r_squared/rmse actually mean something.
    """

    scale: float       # 'a' in elevation = a * relative_value + b
    shift: float        # 'b'
    r_squared: float
    rmse: float
    n_points: int

    def describe(self) -> str:
        quality = "excellent" if self.r_squared > 0.95 else "good" if self.r_squared > 0.8 else "weak"
        return (
            f"elevation = {self.scale:.4f} * relative_value + {self.shift:.4f} "
            f"(R²={self.r_squared:.3f} [{quality}], RMSE={self.rmse:.2f}m, n={self.n_points})"
        )


def fit_scale_shift(relative_values: np.ndarray, true_elevations: np.ndarray) -> CalibrationFit:
    """Fit the linear transform from relative depth values to true elevations.

    Uses ordinary least squares (scipy.stats.linregress) rather than
    anything fancier — with typically only a handful of GCPs, or a modest
    grid of SRTM samples, a simple line is both the right amount of model
    complexity and the one whose failure modes (a bad point dragging the
    fit) are easy to see by eye on a scatter plot.
    """
    relative_values = np.asarray(relative_values, dtype=np.float64).ravel()
    true_elevations = np.asarray(true_elevations, dtype=np.float64).ravel()

    if relative_values.shape != true_elevations.shape:
        raise ValueError(
            f"relative_values and true_elevations must be the same length, "
            f"got {relative_values.shape} vs {true_elevations.shape}"
        )
    n = relative_values.shape[0]
    if n < 2:
        raise InsufficientPointsError(f"Need at least 2 calibration points to fit a line, got {n}")

    result = stats.linregress(relative_values, true_elevations)
    scale, shift = result.slope, result.intercept

    predicted = scale * relative_values + shift
    rmse = float(np.sqrt(np.mean((predicted - true_elevations) ** 2)))

    return CalibrationFit(
        scale=float(scale),
        shift=float(shift),
        r_squared=float(result.rvalue ** 2),
        rmse=rmse,
        n_points=n,
    )


def apply_calibration(relative_depth: np.ndarray, fit: CalibrationFit) -> np.ndarray:
    """Apply a fitted transform to an entire relative-depth array, turning
    it into an absolute elevation array (same shape, values now in meters)."""
    return (fit.scale * relative_depth.astype(np.float64) + fit.shift).astype(np.float32)


def sample_at_points(array: np.ndarray, points_rc: list[tuple[int, int]]) -> np.ndarray:
    """Pull values out of a 2D array at a list of (row, col) pixel positions.

    Used for both: sampling the relative-depth map at GCP locations, and
    (in geo_calibration.py) sampling it at SRTM-grid locations. Kept here,
    not duplicated, since it's the same operation either way — just plain
    NumPy fancy indexing with a bounds check for a clearer error message
    than NumPy's own IndexError would give.
    """
    h, w = array.shape[:2]
    values = np.empty(len(points_rc), dtype=np.float64)
    for i, (row, col) in enumerate(points_rc):
        if not (0 <= row < h and 0 <= col < w):
            raise IndexError(f"Point ({row}, {col}) is outside the array bounds ({h}, {w})")
        values[i] = array[row, col]
    return values