/**
 * Map Service
 * Handles location-based queries, map visualization data, and geographic filtering
 * Port: 3105
 */

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3105;
const MAP_GATEWAY_URL = process.env.MAP_GATEWAY_URL || 'https://maps.googleapis.com';

// In-memory storage for map layers and bookmarks
const mapLayers = new Map();
const userBookmarks = new Map();
const geoQueries = [];

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * POST /map/search
 * Search nearby charging points by coordinates
 */
app.post('/map/search', async (req, res) => {
  try {
    const { latitude, longitude, radius = 5, filters = {} } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    // Query Points Service to get all points
    const pointsServiceUrl = process.env.POINTS_SERVICE_URL || 'http://localhost:3001';
    
    try {
      const pointsResponse = await axios.get(`${pointsServiceUrl}/api/points`, { timeout: 5000 });
      const allPoints = pointsResponse.data.points || [];

      // Filter by distance
      const nearbyPoints = allPoints.filter(point => {
        const distance = calculateDistance(latitude, longitude, point.latitude, point.longitude);
        return distance <= radius;
      });

      // Apply additional filters
      let filtered = nearbyPoints;

      if (filters.provider) {
        filtered = filtered.filter(p => p.provider === filters.provider);
      }

      if (filters.status) {
        filtered = filtered.filter(p => p.status === filters.status);
      }

      if (filters.capacity_min) {
        filtered = filtered.filter(p => p.capacity_kw >= filters.capacity_min);
      }

      if (filters.capacity_max) {
        filtered = filtered.filter(p => p.capacity_kw <= filters.capacity_max);
      }

      // Sort by distance
      filtered.sort((a, b) => {
        const distA = calculateDistance(latitude, longitude, a.latitude, a.longitude);
        const distB = calculateDistance(latitude, longitude, b.latitude, b.longitude);
        return distA - distB;
      });

      // Add distance to results
      const results = filtered.map(p => ({
        ...p,
        distance_km: parseFloat(calculateDistance(latitude, longitude, p.latitude, p.longitude).toFixed(2))
      }));

      res.json({
        searchLocation: { latitude, longitude },
        radius_km: radius,
        total: results.length,
        points: results.slice(0, 50) // Limit to 50 results
      });
    } catch (err) {
      console.error('Error querying Points Service:', err.message);
      return res.status(500).json({ error: 'Failed to query points service', message: err.message });
    }
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

/**
 * POST /map/path
 * Calculate route between two points
 */
app.post('/map/path', async (req, res) => {
  try {
    const { origin, destination, mode = 'driving' } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and destination required' });
    }

    // This would integrate with Google Maps API in production
    const distance = calculateDistance(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    );

    res.json({
      route: {
        origin,
        destination,
        distance_km: parseFloat(distance.toFixed(2)),
        estimatedTime: `${Math.ceil(distance / 50)} minutes` // Rough estimate at 50 km/h
      }
    });
  } catch (err) {
    console.error('Path calculation error:', err);
    res.status(500).json({ error: 'Path calculation failed', message: err.message });
  }
});

/**
 * POST /map/layers/:layerId
 * Create or update map layer
 */
app.post('/map/layers/:layerId', (req, res) => {
  try {
    const { layerId } = req.params;
    const { name, type, data, style } = req.body;

    const layer = {
      id: layerId,
      name: name || 'Unnamed Layer',
      type: type || 'points', // points, heatmap, cluster
      data: data || {},
      style: style || {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mapLayers.set(layerId, layer);

    res.status(201).json({
      message: 'Layer created/updated',
      layer
    });
  } catch (err) {
    console.error('Layer creation error:', err);
    res.status(500).json({ error: 'Layer creation failed', message: err.message });
  }
});

/**
 * GET /map/layers
 * Get all map layers
 */
app.get('/map/layers', (req, res) => {
  try {
    const layers = Array.from(mapLayers.values());
    res.json({
      total: layers.length,
      layers
    });
  } catch (err) {
    console.error('Error fetching layers:', err);
    res.status(500).json({ error: 'Failed to fetch layers', message: err.message });
  }
});

/**
 * GET /map/layers/:layerId
 * Get specific layer
 */
app.get('/map/layers/:layerId', (req, res) => {
  try {
    const { layerId } = req.params;
    const layer = mapLayers.get(layerId);

    if (!layer) {
      return res.status(404).json({ error: 'Layer not found' });
    }

    res.json(layer);
  } catch (err) {
    console.error('Error fetching layer:', err);
    res.status(500).json({ error: 'Failed to fetch layer', message: err.message });
  }
});

/**
 * POST /map/bookmarks
 * Create location bookmark
 */
app.post('/map/bookmarks', (req, res) => {
  try {
    const { userId, latitude, longitude, name, category } = req.body;

    if (!userId || !latitude || !longitude) {
      return res.status(400).json({ error: 'User ID, latitude, and longitude required' });
    }

    const bookmarkId = uuidv4();
    const bookmark = {
      id: bookmarkId,
      userId,
      latitude,
      longitude,
      name: name || 'Bookmark',
      category: category || 'general',
      createdAt: new Date()
    };

    if (!userBookmarks.has(userId)) {
      userBookmarks.set(userId, []);
    }

    userBookmarks.get(userId).push(bookmark);

    res.status(201).json({
      message: 'Bookmark created',
      bookmark
    });
  } catch (err) {
    console.error('Bookmark creation error:', err);
    res.status(500).json({ error: 'Bookmark creation failed', message: err.message });
  }
});

/**
 * GET /map/bookmarks/:userId
 * Get user bookmarks
 */
app.get('/map/bookmarks/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const bookmarks = userBookmarks.get(userId) || [];

    res.json({
      userId,
      total: bookmarks.length,
      bookmarks
    });
  } catch (err) {
    console.error('Error fetching bookmarks:', err);
    res.status(500).json({ error: 'Failed to fetch bookmarks', message: err.message });
  }
});

/**
 * DELETE /map/bookmarks/:userId/:bookmarkId
 * Delete bookmark
 */
app.delete('/map/bookmarks/:userId/:bookmarkId', (req, res) => {
  try {
    const { userId, bookmarkId } = req.params;
    const bookmarks = userBookmarks.get(userId) || [];

    const index = bookmarks.findIndex(b => b.id === bookmarkId);
    if (index === -1) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    bookmarks.splice(index, 1);
    res.json({ message: 'Bookmark deleted' });
  } catch (err) {
    console.error('Bookmark deletion error:', err);
    res.status(500).json({ error: 'Bookmark deletion failed', message: err.message });
  }
});

/**
 * GET /map/statistics
 * Get map usage statistics
 */
app.get('/map/statistics', (req, res) => {
  try {
    res.json({
      layers: mapLayers.size,
      bookmarks: userBookmarks.size,
      geoQueries: geoQueries.length,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Error fetching statistics:', err);
    res.status(500).json({ error: 'Failed to fetch statistics', message: err.message });
  }
});

/**
 * GET /map/health
 * Service health check
 */
app.get('/map/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Map Service',
    port: PORT,
    timestamp: new Date()
  });
});

/**
 * Error handling
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Map Service listening on port ${PORT}`);
});

module.exports = app;
