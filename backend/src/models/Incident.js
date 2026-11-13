const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: [
      'accident',
      'medical',
      'fire',
      'construction',
      'flood',
      'traffic',
      'traffic_jam',
      'crime',
      'pothole',
      'road_damage',
      'waterlogging',
      'illegal_parking',
      'other'
    ],
    default: 'other',
  },
  description: { type: String },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'closed'],
    default: 'pending',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
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
  tags: [{ type: String }],
  resolvedAt: { type: Date },
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Incident', incidentSchema);
