import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  image: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Image',
    required: true,
    index: true,
  },
  jobHash: {
    type: String, // e.g. "#QM-8841" displayed in UI footer
    required: true,
    unique: true,
  },
  backbone: {
    type: String,
    enum: ['small', 'base', 'large'],
    default: 'large',
  },
  calibMethod: {
    type: String,
    enum: ['srtm', 'gcp', 'auto'],
    default: 'srtm',
  },
  status: {
    type: String,
    enum: ['queued', 'active', 'completed', 'failed'],
    default: 'queued',
    index: true,
  },
  stage: {
    type: String,
    enum: ['preprocess', 'depth_inference', 'calibration', 'mesh_generation', 'finalizing'],
    default: 'preprocess',
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  statusMessage: {
    type: String,
    default: 'Pipeline initiated',
  },
  errorMessage: {
    type: String,
  },
}, { timestamps: true });

export default mongoose.model('Job', jobSchema);