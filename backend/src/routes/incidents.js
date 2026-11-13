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
router.post('/', auth.optional, async (req, res) => {
  try {
    const incidentData = { ...req.body };
    if (req.user && req.user.id) {
      incidentData.reportedBy = req.user.id;
    }
    const incident = new Incident(incidentData);
    await incident.save();

    if (incident.reportedBy) {
      try {
        await incident.populate('reportedBy', 'name role email phone');
      } catch (e) {}
    }

    // Emit real-time incident event
    const io = req.app.get('io');
    const roleMap = {
      accident: 'police',
      traffic: 'police',
      traffic_jam: 'police',
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
    const isRoadBlock = incident.type === 'construction' || incident.tags?.includes('road_block') || (incident.title && incident.title.includes('[ROAD BLOCK]'));

    if (io) {
      io.emit('incident-update', { type: 'new', incident });
      // If it's a road block created by construction authority, do not echo back to construction room
      if (targetRole && !(targetRole === 'construction' && isRoadBlock)) {
        io.to(targetRole).emit('incident-update', { type: 'new', incident });
      }
      io.to('admin').emit('incident-update', { type: 'new', incident });
      if (isRoadBlock) {
        io.to('user').emit('incident-update', { type: 'new', incident });
        io.to('all').emit('incident-update', { type: 'new', incident });
      }
    }

    // Automatically generate Alert for high-visibility notification across authority boards
    try {
      const Alert = require('../models/Alert');
      const isRoad = ['pothole', 'road_damage', 'waterlogging', 'construction'].includes(incident.type);
      const isMedical = incident.type === 'medical';

      const targetRoles = isRoadBlock
        ? ['user', 'all', 'admin', 'police', 'ambulance']
        : isRoad
        ? ['construction', 'admin', 'all']
        : isMedical
        ? ['ambulance', 'admin', 'all']
        : ['police', 'admin', 'all'];

      const alert = new Alert({
        title: isRoadBlock
          ? (incident.title?.startsWith('🚧') ? incident.title : `🚧 ${incident.title}`)
          : `⚠️ ${incident.title || (incident.type ? incident.type.toUpperCase() : 'CIVIC REPORT')}`,
        message: incident.description || `${incident.type} reported at ${incident.location?.address || 'Belagavi'}`,
        type: isRoad ? 'traffic' : isMedical ? 'emergency' : 'warning',
        severity: incident.priority === 'critical' ? 'critical' : incident.priority === 'high' ? 'high' : 'medium',
        targetRoles,
        location: incident.location,
        createdBy: req.user ? req.user.id : undefined,
      });
      await alert.save();

      if (io) {
        io.emit('new-alert', alert);
        targetRoles.forEach(r => io.to(r).emit('new-alert', alert));
      }
    } catch (alertErr) {
      console.warn('[Incidents] Alert creation error:', alertErr.message);
    }

    res.status(201).json(incident);
  } catch (err) {
    console.error('[Incidents] POST error:', err);
    res.status(500).json({ message: err.message || 'Server error' });
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
