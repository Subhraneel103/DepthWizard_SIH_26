import mongoose from 'mongoose';

const validationReportSchema = new mongoose.Schema({
  dsmResultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DsmResult',
    required: true,
    index: true,
  },
  referenceSource: {
    type: String,
    default: 'gcp_residuals', // e.g. 'gcp_residuals', 'usgs_lidar', 'srtm_benchmark'
  },
  metrics: {
    rmse: { type: Number, required: true },       // Root Mean Square Error (meters)
    mae: { type: Number, required: true },        // Mean Absolute Error (meters)
    maxError: { type: Number, required: true },   // Maximum residual error (meters)
    correlation: { type: Number },                // Pearson r or R^2 correlation with reference
  },
  residuals: [{
    gcpLabel: { type: String },
    errorMeters: { type: Number },
    measuredElevation: { type: Number },
    referenceElevation: { type: Number },
  }],
  accuracyGrade: {
    type: String,
    enum: ['A', 'B', 'C', 'F'],
    default: 'A',
  },
  // Breakdown by terrain type (urban/sparse/hilly/forested) per depthwizard-design.md
  breakdown: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, { timestamps: true });

export default mongoose.model('ValidationReport', validationReportSchema);