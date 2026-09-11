"""
The Python ML service's HTTP entrypoint (design doc: apps/ml-service).

This is the ONLY thing that connects your OpenCV/PyTorch code to the rest of
the stack. Three.js never calls this; React never calls this. Only the
Node/BullMQ worker calls this, over plain internal HTTP (see design doc:
"Keep ml-service behind an internal-only endpoint" — no auth/CORS here on
purpose, since it's never reachable from a browser).

This file is deliberately thin: decode the HTTP request, call into
service.py, encode the HTTP response. All the actual logic lives in
service.py specifically so it can be unit-tested without FastAPI installed
(see tests/test_service.py) — I can't run THIS file myself (no internet in
my sandbox to `pip install fastapi`), so treat the commands below as your
verification step, not a formality.

Run locally:
    pip install fastapi uvicorn python-multipart --break-system-packages
    uvicorn src.main:app --reload --port 8000

Then, with no Node/Express running at all:
    curl -X POST "http://localhost:8000/infer-depth?format=png" \
         -F "image=@sample_data/tiled_preview.png" \
         -o preview_depth.png -D -
    # -D - prints response headers, including X-Depth-Min/Max/Width/Height
    # open preview_depth.png and check it looks like a depth map

    curl -X POST "http://localhost:8000/infer-depth" \
         -F "image=@sample_data/tiled_preview.png" \
         -o preview_depth.npy
    python3 -c "import numpy as np; print(np.load('preview_depth.npy').shape)"

Or just open http://localhost:8000/docs — FastAPI auto-generates an
interactive UI where you can upload a file and see the response, no
curl/Python needed at all.
"""

import logging
import os
from typing import Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from model.depth_infer import HFDepthAnythingV2, get_model
from service import (
    InvalidImageError,
    UploadTooLargeError,
    encode_depth_npy,
    encode_depth_png,
    process_image_bytes,
)

logger = logging.getLogger("ml-service")

app = FastAPI(title="DepthWizard ML Service")

# Overridable via env var so Docker Compose / Colab can pick a bigger model
# without a code change — see design doc's "multi-backbone selection" feature.
MODEL_SIZE = os.environ.get("DEPTHWIZARD_MODEL_SIZE", "small")
if MODEL_SIZE not in HFDepthAnythingV2.CHECKPOINTS:
    raise ValueError(f"DEPTHWIZARD_MODEL_SIZE={MODEL_SIZE!r} is not one of {list(HFDepthAnythingV2.CHECKPOINTS)}")


class InferDepthMeta(BaseModel):
    """Mirrors the headers set on the real /infer-depth response — kept as
    its own model so /infer-depth/meta can return pure JSON for callers
    (like a quick frontend health check) that don't want the binary payload."""

    width: int
    height: int
    tile_count: int
    processing_ms: int
    depth_min: float
    depth_max: float


@app.on_event("startup")
async def load_model_on_startup():
    """Load model weights ONCE at startup, not per-request — loading takes
    several seconds, and doing that on every call would make each request
    unusably slow. Failing fast here (crashing on startup if weights can't
    download) is deliberate: better to know immediately than to field 500s
    on the first real request during a demo."""
    try:
        get_model(MODEL_SIZE)
    except Exception:
        logger.exception(
            f"Failed to load model {MODEL_SIZE!r} on startup. "
            "Common causes: no internet (weights download from Hugging Face on "
            "first use), or torch/transformers not installed — check requirements.txt."
        )
        raise


@app.post("/infer-depth")
async def infer_depth(
    image: UploadFile = File(...),
    format: Literal["npy", "png"] = Query(
        "npy", description="npy = raw float32 array for calibration; png = normalized preview image"
    ),
):
    """
    Request: multipart/form-data, single `image` file field.

    Response: binary body (the depth map, in the requested format) PLUS
    metadata in response headers (X-Width, X-Height, X-Tile-Count,
    X-Processing-Ms, X-Depth-Min, X-Depth-Max) rather than wrapping
    everything in a JSON envelope. This is deliberate: base64-encoding a
    binary payload into JSON bloats it ~33% for no benefit when the caller
    is the Node worker, not a browser form — and headers are cheap to read
    on the worker side (`response.headers['X-Width']`) without needing to
    parse a multipart JSON+binary response.

    format=npy (default): raw float32 relative-elevation array, exact
    values preserved — this is what the calibration stage needs.
    format=png: min-max-normalized grayscale preview — for a human to look
    at (via /docs, or curl -o), never for feeding into calibration.
    """
    raw_bytes = await image.read()
    model = get_model(MODEL_SIZE)

    try:
        result = process_image_bytes(raw_bytes, model)
    except InvalidImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except UploadTooLargeError as e:
        raise HTTPException(status_code=413, detail=str(e))

    if format == "npy":
        payload = encode_depth_npy(result.depth)
        media_type = "application/octet-stream"
    else:
        payload = encode_depth_png(result.depth)
        media_type = "image/png"

    headers = {
        "X-Width": str(result.width),
        "X-Height": str(result.height),
        "X-Tile-Count": str(result.tile_count),
        "X-Processing-Ms": str(result.processing_ms),
        "X-Depth-Min": f"{result.depth.min():.6f}",
        "X-Depth-Max": f"{result.depth.max():.6f}",
        "Content-Disposition": f'attachment; filename="depth.{format}"',
    }
    return Response(content=payload, media_type=media_type, headers=headers)


@app.get("/health")
async def health():
    """Worker/orchestrator hits this before enqueueing work, so a dead ML
    service fails fast instead of a job timing out minutes later."""
    return {"status": "ok", "model_size": MODEL_SIZE}