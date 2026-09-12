import mongoose from 'mongoose';

const gcpSubSchema = new mongoose.Schema({
  label: { type: String, default: 'GCP' },
  pixelX: { type: Number, required: true },
  pixelY: { type: Number, required: true },
  lat: { type: Number },
  lon: { type: Number },
  elevation: { type: Number, required: true },
  residualError: { type: Number, default: 0.0 }, // e.g. ±0.4m
  source: { type: String, enum: ['manual', 'srtm', 'basemap'], default: 'manual' },
  createdAt: { type: Date, default: Date.now }
});

const imageSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },
  filename: { type: String, required: true },
  storagePath: { type: String, required: true },
  isGeoreferenced: { type: Boolean, default: false },
  crs: { type: String, default: 'EPSG:4326' },
  bounds: {
    type: {
      type: String,
      enum: ['Polygon'],
      default: 'Polygon',
    },
    coordinates: {
      type: [[[Number]]], // GeoJSON standard: [[[lng, lat], ...]]
      default: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    },
  },
  resolution: { type: Number, default: 0.5 }, // 0.5m GSD
  gcps: [gcpSubSchema],
  uploadedAt: { type: Date, default: Date.now },
});

imageSchema.index({ bounds: '2dsphere' });

export default mongoose.model('Image', imageSchema);