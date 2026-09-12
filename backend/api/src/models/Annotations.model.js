import mongoose from 'mongoose';

const annotationSchema = new mongoose.Schema({
  image: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Image',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['point', 'distance_vector'],
    default: 'distance_vector',
  },
  pointA: {
    label: { type: String, default: 'PK-ALPHA' },
    elevation: { type: Number, default: 628.0 },
    coords: [Number], // [x, y, z] in Three.js space
  },
  pointB: {
    label: { type: String, default: 'COL-DELTA' },
    elevation: { type: Number, default: 446.0 },
    coords: [Number],
  },
  calculatedMetrics: {
    distanceMeters: { type: Number, default: 142.5 },
    slopeDegrees: { type: Number, default: 12.8 },
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Annotation', annotationSchema);