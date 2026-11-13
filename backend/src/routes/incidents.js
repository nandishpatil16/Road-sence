const express = require('express');
const Incident = require('../models/Incident');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/incidents
router.get('/', auth.optional, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.type) filter.type = req.query.type;

    const incidents = await Incident.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 100)
      .populate('reportedBy', 'name role')
      .populate('assignedTo', 'name role');

    res.json(incidents);
  } catch (err) {
    console.error('[Incidents] GET error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/incidents/:id
router.get('/:id', auth.optional, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('reportedBy', 'name role')
      .populate('assignedTo', 'name role');
    if (!incident) return res.status(404).json({ message: 'Incident not found' });
    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/incidents
router.post('/', auth, async (req, res) => {
  try {
    const incident = new Incident({
      ...req.body,
      reportedBy: req.user.id,
    });
    await incident.save();
    await incident.populate('reportedBy', 'name role email phone');

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.emit('incident-update', { type: 'new', incident });
      // Notify relevant authority rooms
      const roleMap = {
        accident: 'police',
        traffic: 'police',
        crime: 'police',
        illegal_parking: 'police',
        medical: 'ambulance',
        construction: 'construction',
        pothole: 'construction',
        road_damage: 'construction',
        flood: 'construction',
        waterlogging: 'construction',
      };
      const targetRole = roleMap[incident.type];
      if (targetRole) io.to(targetRole).emit('incident-update', { type: 'new', incident });
      io.to('admin').emit('incident-update', { type: 'new', incident });
    }

    res.status(201).json(incident);
  } catch (err) {
    console.error('[Incidents] POST error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/incidents/:id
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.body.status === 'resolved' && !req.body.resolvedAt) {
      req.body.resolvedAt = new Date();
    }
    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    // Emit update
    const io = req.app.get('io');
    if (io) io.emit('incident-update', { type: 'update', incident });

    res.json(incident);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/incidents/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const incident = await Incident.findByIdAndDelete(req.params.id);
    if (!incident) return res.status(404).json({ message: 'Incident not found' });

    const io = req.app.get('io');
    if (io) io.emit('incident-update', { type: 'delete', id: req.params.id });

    res.json({ message: 'Incident deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
