import mongoose from 'mongoose';

const dsmResultSchema = new mongoose.Schema({
  image: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Image',
    required: true,
    index: true, // Non-unique to allow multiple runs per image with different backbones/GCPs
  },
  // Storage paths for pipeline deliverables
  storagePathGeotiff: { type: String, required: true }, // Absolute DSM GeoTIFF (.tif)
  storagePathMesh: { type: String, required: true },    // 3D terrain mesh (.glb)
  storagePathZip: { type: String },                     // Complete bundle zip (mesh.glb + dsm.tif + obj)
  storagePathNpy: { type: String },                     // Raw float32 elevation array (.npy)
  storagePathConfidence: { type: String },              // Optional per-pixel uncertainty raster
  storagePathPointCloud: { type: String },              // Optional LAS / LAZ point cloud
  storagePathVideo: { type: String },                   // Optional MP4 Orbit/flythrough clip

  // Elevation & mesh geometry metrics
  minElevation: { type: Number },
  maxElevation: { type: Number },
  vertexCount: { type: Number, default: 0 },
  faceCount: { type: Number, default: 0 },
  processingTimeMs: { type: Number },

  // Model & calibration configuration used for this run
  modelBackbone: {
    type: String,
    enum: ['small', 'base', 'large'],
    default: 'small',
  },
  calibrationMethod: {
    type: String,
    enum: ['srtm', 'gcp', 'none', 'auto'],
    default: 'none',
  },
  calibrationFit: {
    scale: { type: Number },
    shift: { type: Number },
    rSquared: { type: Number },
    rmse: { type: Number },
    nPoints: { type: Number },
  },
  meshParameters: {
    pixelSizeX: { type: Number, default: 1.0 },
    pixelSizeZ: { type: Number, default: 1.0 },
    zExaggeration: { type: Number, default: 1.0 },
  },
}, { timestamps: true });

export default mongoose.model('DsmResult', dsmResultSchema);