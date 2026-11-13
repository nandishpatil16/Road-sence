const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['emergency', 'warning', 'info', 'traffic', 'weather'],
    default: 'info',
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  targetRoles: [{
    type: String,
    enum: ['police', 'ambulance', 'construction', 'admin', 'all'],
  }],
  location: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String },
  },
  isResolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Alert', alertSchema);
