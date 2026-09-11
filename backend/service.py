"""
Pure request-handling logic for the ML service — deliberately has ZERO
FastAPI/Starlette imports.

Why: FastAPI isn't installed in my sandbox (no internet to pip install it),
so anything that imports it can't be executed here at all, only read. By
keeping all the actual logic in this file as plain functions on bytes/arrays,
main.py becomes a thin adapter (decode HTTP request -> call here -> encode
HTTP response), and everything ABOVE that thin adapter layer — image
decoding, size limits, error cases, byte encoding — is fully unit-tested
in tests/test_service.py without needing FastAPI on the path at all.
"""

import io
import time
from dataclasses import dataclass

import cv2
import numpy as np

from model.depth_infer import DepthModel, normalize_for_display, run_depth_pipeline
from model.preprocess import resize_max_side, tile_image

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB — generous for a phone/drone photo; guards against a runaway upload
TILE_SIZE = 512
TILE_OVERLAP = 64
MAX_SIDE = 2048


class InvalidImageError(ValueError):
    """Raised when the uploaded bytes can't be decoded as an image."""


class UploadTooLargeError(ValueError):
    """Raised when the upload exceeds the configured size limit."""


@dataclass
class DepthResult:
    depth: np.ndarray  # float32 (H, W) relative elevation — see depth_infer.to_relative_elevation
    width: int
    height: int
    tile_count: int
    processing_ms: int


def process_image_bytes(
    raw_bytes: bytes,
    model: DepthModel,
    max_upload_bytes: int = MAX_UPLOAD_BYTES,
) -> DepthResult:
    """The actual work: raw upload bytes in, a DepthResult out. No HTTP
    concepts anywhere in this function — that's what makes it testable
    without a running server.

    max_upload_bytes is a parameter (not just the module constant) specifically
    so tests can pass a tiny limit and deterministically trigger
    UploadTooLargeError without allocating a real 20MB buffer.
    """
    if len(raw_bytes) > max_upload_bytes:
        raise UploadTooLargeError(f"Upload is {len(raw_bytes)} bytes, max allowed is {max_upload_bytes}")

    start = time.monotonic()

    np_buffer = np.frombuffer(raw_bytes, dtype=np.uint8)
    img_bgr = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise InvalidImageError("Could not decode image bytes — is this a valid JPG/PNG?")
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    img_rgb = resize_max_side(img_rgb, max_side=MAX_SIDE)

    depth = run_depth_pipeline(img_rgb, model, tile_size=TILE_SIZE, overlap=TILE_OVERLAP)
    # tile_image is cheap pure-NumPy slicing — recomputing it just for the
    # count is negligible next to model inference time, and keeps
    # run_depth_pipeline's return type a plain array rather than a tuple.
    tile_count = len(tile_image(img_rgb, tile_size=TILE_SIZE, overlap=TILE_OVERLAP))

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return DepthResult(
        depth=depth,
        width=img_rgb.shape[1],
        height=img_rgb.shape[0],
        tile_count=tile_count,
        processing_ms=elapsed_ms,
    )


def encode_depth_npy(depth: np.ndarray) -> bytes:
    """Serialize the raw float32 depth array — .npy, not an image format.
    Calibration needs exact float values; PNG/JPEG would clip or quantize
    them, silently corrupting the linear fit downstream."""
    buf = io.BytesIO()
    np.save(buf, depth)
    return buf.getvalue()


def encode_depth_png(depth: np.ndarray) -> bytes:
    """Encode a min-max-normalized PNG purely for human eyeballing (browser
    preview via /docs, a quick sanity check) — never feed this into
    calibration. See depth_infer.normalize_for_display's docstring for why."""
    display = normalize_for_display(depth)
    ok, buf = cv2.imencode(".png", display)
    if not ok:
        raise RuntimeError("PNG encoding failed unexpectedly")
    return buf.tobytes()