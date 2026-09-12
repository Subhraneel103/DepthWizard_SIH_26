import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  userId: {
    type: String, // Stores Clerk's unique ID directly (e.g., 'user_2xyz...')
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Project', projectSchema);