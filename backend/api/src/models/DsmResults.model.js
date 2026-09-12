import mongoose from 'mongoose';

const dsmResultSchema = new mongoose.Schema({
  image: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Image',
    required: true,
    unique: true,
  },
  storagePathGeotiff: { type: String, required: true }, // Absolute DSM
  storagePathMesh: { type: String, required: true },    // glTF 2.0 / Draco
  storagePathPointCloud: { type: String },              // LAS / LAZ
  storagePathVideo: { type: String },                   // MP4 Orbit clip
  minElevation: { type: Number, default: 0.0 },
  maxElevation: { type: Number, default: 600.0 },
  vertexCount: { type: Number, default: 0 },            // e.g. 842,000 pts
  generatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('DsmResult', dsmResultSchema);