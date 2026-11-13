const express = require('express');
const Incident = require('../models/Incident');
const Alert = require('../models/Alert');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const [
      totalIncidents,
      activeIncidents,
      resolvedIncidents,
      criticalIncidents,
      totalAlerts,
      activeAlerts,
      totalComplaints,
      pendingComplaints,
      activeUsers,
    ] = await Promise.all([
      Incident.countDocuments(),
      Incident.countDocuments({ status: { $in: ['pending', 'in_progress'] } }),
      Incident.countDocuments({ status: 'resolved' }),
      Incident.countDocuments({ priority: { $in: ['high', 'critical'] }, status: { $ne: 'resolved' } }),
      Alert.countDocuments(),
      Alert.countDocuments({ isResolved: false }),
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: 'pending' }),
      User.countDocuments({ isActive: true }),
    ]);

    res.json({
      incidents: { total: totalIncidents, active: activeIncidents, resolved: resolvedIncidents, critical: criticalIncidents },
      alerts: { total: totalAlerts, active: activeAlerts },
      complaints: { total: totalComplaints, pending: pendingComplaints },
      users: { active: activeUsers },
    });
  } catch (err) {
    console.error('[Dashboard] Stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/dashboard/analytics
router.get('/analytics', auth, async (req, res) => {
  try {
    // Incidents by type
    const byType = await Incident.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    // Incidents by priority
    const byPriority = await Incident.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    // Incidents by status
    const byStatus = await Incident.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Last 7 days trend
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const trend = await Incident.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ byType, byPriority, byStatus, trend });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
