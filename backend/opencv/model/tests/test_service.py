"""
Tests for service.py — the request-handling logic that main.py's FastAPI
routes thinly wrap. None of this imports FastAPI, so it runs in ANY Python
environment, including mine (no internet, no fastapi installed).

What this does NOT test: the actual HTTP layer (routing, status codes,
multipart parsing) — that needs FastAPI/Starlette running, which you'll
confirm yourself with `uvicorn src.main:app` + curl. See the curl commands
at the bottom of main.py's docstring.

Run with: python3 tests/test_service.py
"""

import io
import sys
from pathlib import Path

import cv2
import numpy as np

_OPENCV_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_OPENCV_ROOT) not in sys.path:
    sys.path.insert(0, str(_OPENCV_ROOT))

from model.depth_infer import DummyDepthModel
from service import (
    DepthResult,
    InvalidImageError,
    UploadTooLargeError,
    encode_depth_npy,
    encode_depth_png,
    process_image_bytes,
)


def make_synthetic_image_bytes(h: int, w: int) -> bytes:
    """A real, valid PNG's worth of bytes — not a numpy array — since
    process_image_bytes's whole job starts with decoding raw bytes, exactly
    like what FastAPI's UploadFile.read() would hand it."""
    yy, xx = np.mgrid[0:h, 0:w]
    gradient = ((xx / w) * 255).astype(np.uint8)
    img_bgr = np.stack([gradient, gradient, gradient], axis=-1)  # BGR, matches what cv2.imencode expects
    ok, buf = cv2.imencode(".png", img_bgr)
    assert ok
    return buf.tobytes()


def test_process_image_bytes_happy_path():
    raw = make_synthetic_image_bytes(300, 400)
    model = DummyDepthModel()

    result = process_image_bytes(raw, model)

    assert isinstance(result, DepthResult)
    assert result.width == 400 and result.height == 300
    assert result.depth.shape == (300, 400)
    assert result.tile_count == 1  # smaller than tile_size=512, should be a single tile
    assert result.processing_ms >= 0
    print(f"  process_image_bytes: {result.width}x{result.height}, "
          f"{result.tile_count} tile(s), {result.processing_ms}ms")


def test_process_image_bytes_multi_tile():
    raw = make_synthetic_image_bytes(900, 1400)
    model = DummyDepthModel()
    result = process_image_bytes(raw, model)
    assert result.tile_count > 1, "a 1400x900 image should require multiple tiles"
    assert result.depth.shape == (900, 1400)
    print(f"  process_image_bytes: multi-tile case gives {result.tile_count} tiles, correct output shape")


def test_process_image_bytes_resizes_oversized_images():
    """Stage 1's resize_max_side should kick in for anything bigger than
    MAX_SIDE (2048) — verifies the safety cap is actually wired up here,
    not just implemented and forgotten."""
    raw = make_synthetic_image_bytes(3000, 2000)
    model = DummyDepthModel()
    result = process_image_bytes(raw, model)
    assert max(result.width, result.height) <= 2048, (
        f"expected resize down to <=2048, got {result.width}x{result.height}"
    )
    print(f"  process_image_bytes: oversized 2000x3000 correctly resized to {result.width}x{result.height}")


def test_process_image_bytes_rejects_garbage():
    model = DummyDepthModel()
    try:
        process_image_bytes(b"this is not an image, just some bytes", model)
        assert False, "should have raised InvalidImageError"
    except InvalidImageError:
        print("  process_image_bytes: correctly rejects undecodable bytes")


def test_process_image_bytes_rejects_oversized_upload():
    raw = make_synthetic_image_bytes(50, 50)
    model = DummyDepthModel()
    # Pass a deliberately tiny limit so we don't need to allocate a real 20MB
    # buffer to exercise this path.
    try:
        process_image_bytes(raw, model, max_upload_bytes=10)
        assert False, "should have raised UploadTooLargeError"
    except UploadTooLargeError:
        print("  process_image_bytes: correctly rejects uploads over the size limit")


def test_encode_depth_npy_roundtrip():
    """The whole point of the npy format is exact float preservation —
    verify it actually survives encode->decode with zero precision loss."""
    depth = np.array([[1.5, -2.75, 0.0], [100.125, -0.001, 3.0]], dtype=np.float32)
    encoded = encode_depth_npy(depth)
    decoded = np.load(io.BytesIO(encoded))
    assert np.array_equal(depth, decoded), "npy round-trip should be lossless"
    assert decoded.dtype == np.float32
    print("  encode_depth_npy: lossless round-trip confirmed")


def test_encode_depth_png_is_valid_and_normalized():
    depth = np.array([[0.0, 50.0], [100.0, 25.0]], dtype=np.float32)
    encoded = encode_depth_png(depth)

    decoded = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    assert decoded is not None, "encode_depth_png should produce a valid, decodable PNG"
    assert decoded.shape == (2, 2)
    # 0.0 -> darkest (0), 100.0 -> brightest (255), min-max normalized.
    assert decoded[0, 0] == 0
    assert decoded[1, 0] == 255
    print("  encode_depth_png: produces a valid, correctly-normalized PNG")


def run_all():
    tests = [
        test_process_image_bytes_happy_path,
        test_process_image_bytes_multi_tile,
        test_process_image_bytes_resizes_oversized_images,
        test_process_image_bytes_rejects_garbage,
        test_process_image_bytes_rejects_oversized_upload,
        test_encode_depth_npy_roundtrip,
        test_encode_depth_png_is_valid_and_normalized,
    ]
    print(f"Running {len(tests)} tests (no FastAPI required)...\n")
    for fn in tests:
        fn()
    print("\nAll tests passed.")
    print("\nNOTE: the actual HTTP layer (main.py's routes) is NOT covered here.")
    print("Run `uvicorn src.main:app --reload` and test with curl to verify that part.")


if __name__ == "__main__":
    run_all()