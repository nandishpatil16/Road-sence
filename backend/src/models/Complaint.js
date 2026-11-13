const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: {
    type: String,
    enum: ['road', 'drainage', 'electricity', 'water', 'sanitation', 'noise', 'traffic', 'other'],
    default: 'other',
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'rejected'],
    default: 'pending',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  location: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String },
  },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  images: [{ type: String }],
  adminNote: { type: String },
  resolvedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Complaint', complaintSchema);
