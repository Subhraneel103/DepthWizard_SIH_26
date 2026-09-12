"""
Stage 3b: Geospatial calibration — the SRTM-automatic path.

Unlike calibration.py, this file genuinely needs rasterio, pyproj, and
network access (to fetch SRTM tiles from OpenTopography). None of those
exist in my sandbox — no internet, and rasterio/pyproj aren't installed.
I have NOT run a single line of this file. It's written carefully against
stable, well-documented APIs (rasterio and pyproj have been stable for
years), but treat every function here as "needs your verification in a
real environment," not "confirmed working."

All rasterio/pyproj imports are LAZY (inside functions, not at module top)
for the same reason depth_infer.py lazy-imports torch: it keeps this module
importable — and its pure-Python logic testable — even in an environment
that doesn't have these libraries installed yet.

This is the SRTM-automatic calibration path. The GCP-manual path doesn't
need any of this — see calibration.sample_at_points + fit_scale_shift,
called directly with hand-entered elevations, no georeferencing required.
"""

import numpy as np

from .calibration import CalibrationFit, fit_scale_shift, sample_at_points


class NotGeoreferencedError(ValueError):
    """Raised when SRTM calibration is attempted on an image with no CRS —
    there's no way to know which lat/lon a pixel covers without one, so this
    path is simply inapplicable; use GCP calibration instead."""


def read_raster_geotransform(path: str):
    """Open a GeoTIFF and return (crs, transform, width, height) — the
    minimum needed to convert pixel coordinates to geographic coordinates.

    Returns None if the file has no CRS (i.e. it's a plain image, not a
    georeferenced one) — callers should treat that as "fall back to GCP
    calibration," not as an error, since plenty of valid input images
    (a phone photo, a drone JPEG with no embedded GPS) simply aren't
    georeferenced and that's expected, not exceptional.
    """
    import rasterio  # lazy import — see module docstring

    with rasterio.open(path) as dataset:
        if dataset.crs is None:
            return None
        return {
            "crs": dataset.crs,
            "transform": dataset.transform,
            "width": dataset.width,
            "height": dataset.height,
            "bounds": dataset.bounds,
        }


def pixel_to_lonlat(row: int, col: int, transform, crs) -> tuple[float, float]:
    """Convert a (row, col) pixel position to (lon, lat) in WGS84 (EPSG:4326)
    — the CRS both SRTM and the OpenTopography API expect.

    Two steps, each easy to get backwards if you're not careful:
      1. rasterio's `transform * (col, row)` gives coordinates in the
         RASTER's own CRS (which might be a projected CRS in meters, not
         lat/lon at all) — note the (col, row) order, not (row, col);
         affine transforms are x,y (i.e. col,row), the opposite of NumPy's
         array indexing order, and mixing these up silently transposes
         your whole calibration grid.
      2. If that CRS isn't already WGS84, reproject with pyproj — SRTM
         tiles and the OpenTopography API are always WGS84 lat/lon.
    """
    import pyproj  # lazy import

    native_x, native_y = transform * (col, row)

    if crs.to_epsg() == 4326:
        return native_x, native_y  # already lon/lat

    transformer = pyproj.Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(native_x, native_y)
    return lon, lat


def fetch_srtm_tile(min_lon: float, min_lat: float, max_lon: float, max_lat: float, api_key: str, out_path: str) -> str:
    """Download an SRTM GeoTIFF covering the given bounding box, via the
    OpenTopography API (register for a free key at opentopography.org/developers).

    NEEDS NETWORK — cannot run in my sandbox, only in your real environment.
    """
    import requests

    response = requests.get(
        "https://portal.opentopography.org/API/globaldem",
        params={
            "demtype": "SRTMGL1",  # SRTM, ~30m resolution — matches the design doc's calibration plan
            "south": min_lat,
            "north": max_lat,
            "west": min_lon,
            "east": max_lon,
            "outputFormat": "GTiff",
            "API_Key": api_key,
        },
        timeout=60,
    )
    response.raise_for_status()
    with open(out_path, "wb") as f:
        f.write(response.content)
    return out_path


def sample_srtm_at_lonlats(srtm_path: str, lonlats: list[tuple[float, float]]) -> np.ndarray:
    """Sample elevation values from a downloaded SRTM GeoTIFF at a list of
    (lon, lat) points, using rasterio's built-in `.sample()` — this handles
    the lon/lat -> pixel-index conversion internally, so we don't have to
    reimplement it (and risk getting the row/col vs x/y order backwards
    a second time, on top of the one in pixel_to_lonlat above)."""
    import rasterio

    with rasterio.open(srtm_path) as dataset:
        values = np.array([val[0] for val in dataset.sample(lonlats)], dtype=np.float64)
    return values


def build_sample_grid(height: int, width: int, step: int) -> list[tuple[int, int]]:
    """Generate an evenly-spaced grid of (row, col) pixel positions to
    sample for automatic SRTM calibration — no reason to sample every
    single pixel (SRTM itself is only ~30m resolution, far coarser than
    a typical image, so oversampling the image just wastes API calls
    without adding real information).

    This function is pure Python — no rasterio needed — so it IS tested
    directly, even though the functions around it aren't.
    """
    rows = range(step // 2, height, step)
    cols = range(step // 2, width, step)
    return [(r, c) for r in rows for c in cols]


def calibrate_from_srtm(
    georeferenced_image_path: str,
    relative_depth: np.ndarray,
    api_key: str,
    srtm_cache_path: str = "/tmp/srtm_tile.tif",
    grid_step: int = 100,
) -> CalibrationFit:
    """
    Orchestrates the full SRTM-automatic calibration path:
      1. Read the source image's CRS/transform (fails loudly if not georeferenced)
      2. Lay a sparse grid of sample points over the image
      3. Convert each grid point to (lon, lat)
      4. Download an SRTM tile covering the image's bounding box
      5. Sample SRTM elevation at each grid point
      6. Sample the relative-depth map at the SAME grid points
      7. Fit scale+shift between the two

    NEEDS NETWORK (step 4) and rasterio+pyproj installed — verify this
    yourself; I could not run any part of this function.
    """
    geo = read_raster_geotransform(georeferenced_image_path)
    if geo is None:
        raise NotGeoreferencedError(
            f"{georeferenced_image_path} has no embedded CRS — use GCP calibration "
            "(calibration.fit_scale_shift with hand-entered points) instead."
        )

    sample_points = build_sample_grid(geo["height"], geo["width"], step=grid_step)
    lonlats = [pixel_to_lonlat(r, c, geo["transform"], geo["crs"]) for r, c in sample_points]

    lons = [ll[0] for ll in lonlats]
    lats = [ll[1] for ll in lonlats]
    fetch_srtm_tile(min(lons), min(lats), max(lons), max(lats), api_key, srtm_cache_path)

    srtm_elevations = sample_srtm_at_lonlats(srtm_cache_path, lonlats)
    relative_values = sample_at_points(relative_depth, sample_points)

    return fit_scale_shift(relative_values, srtm_elevations)