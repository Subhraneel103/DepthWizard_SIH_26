import mongoose from 'mongoose';

const validationReportSchema = new mongoose.Schema({
    dsmResultId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DsmResult',
        required: true,
        index: true,
    },
    metrics: {
        rmse: { type: Number, required: true }, // Root Mean Square Error
        mae: { type: Number, required: true },  // Mean Absolute Error
        maxError: { type: Number, required: true },
    },
    residuals: [{
        gcpLabel: String,
        errorMeters: Number,
    }],
    accuracyGrade: { type: String, enum: ['A', 'B', 'C', 'F'], default: 'A' },
    generatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('ValidationReport', validationReportSchema);