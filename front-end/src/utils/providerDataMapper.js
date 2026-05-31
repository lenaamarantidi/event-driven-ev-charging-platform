/**
 * Provider Data Mapper Wrapper
 * 
 * Ενσωμάτωση του ProviderDataMapper από το Reservation_Service
 * Κανονικοποιεί responses από τις 3 διαφορετικές APIs:
 * - redPlug (pointid, long/lat)
 * - greenPlug (id, coords.long/coords.lat)
 * - bluePlug (chargerId, geo[] array)
 * 
 * Σε ενοποιημένο schema:
 * {
 *   unifiedPointId,
 *   providerName,
 *   currentStatus,
 *   reservationEndTime,
 *   pricePerKwh,
 *   coordinates: { longitude, latitude }
 * }
 */

/**
 * Unified Point Schema
 */
class UnifiedPoint {
  constructor(data = {}) {
    this.unifiedPointId = data.unifiedPointId || null;
    this.providerName = data.providerName || null;
    this.currentStatus = data.currentStatus || null;
    this.reservationEndTime = data.reservationEndTime || null;
    this.pricePerKwh = data.pricePerKwh || 0;
    this.coordinates = {
      longitude: data.coordinates?.longitude || 0,
      latitude: data.coordinates?.latitude || 0
    };
  }

  toJSON() {
    return {
      unifiedPointId: this.unifiedPointId,
      providerName: this.providerName,
      currentStatus: this.currentStatus,
      reservationEndTime: this.reservationEndTime,
      pricePerKwh: this.pricePerKwh,
      coordinates: this.coordinates
    };
  }
}

/**
 * RedPlug Mapper
 * Κανονικοποίηση RedPlug responses → UnifiedPoint
 */
class RedPlugMapper {
  static normalize(redData) {
    if (!redData) {
      throw new Error('RedPlug data is required');
    }

    try {
      const unified = new UnifiedPoint({
        unifiedPointId: redData.pointid,
        providerName: 'redPlug',
        currentStatus: redData.status,
        reservationEndTime: redData.reservationendtime || null,
        pricePerKwh: redData.pricePerKwh || 0,
        coordinates: {
          longitude: redData.long || 0,
          latitude: redData.lat || 0
        }
      });

      return unified;
    } catch (error) {
      console.error('[RedPlugMapper] Κανονικοποίηση error:', error.message);
      throw new Error(`Failed to normalize RedPlug data: ${error.message}`);
    }
  }

  static normalizeReservation(redReservationData) {
    return this.normalize(redReservationData);
  }
}

/**
 * GreenPlug Mapper
 * Κανονικοποίηση GreenPlug responses → UnifiedPoint
 */
class GreenPlugMapper {
  static normalize(greenData) {
    if (!greenData) {
      throw new Error('GreenPlug data is required');
    }

    try {
      const unified = new UnifiedPoint({
        unifiedPointId: greenData.id,
        providerName: 'greenPlug',
        currentStatus: greenData.state,
        reservationEndTime: greenData.reservedUntil || null,
        pricePerKwh: greenData.kwhRateEur || 0,
        coordinates: {
          longitude: greenData.coords?.long || 0,
          latitude: greenData.coords?.lat || 0
        }
      });

      return unified;
    } catch (error) {
      console.error('[GreenPlugMapper] Κανονικοποίηση error:', error.message);
      throw new Error(`Failed to normalize GreenPlug data: ${error.message}`);
    }
  }

  static normalizeReservation(greenReservationData) {
    return this.normalize(greenReservationData);
  }
}

/**
 * BluePlug Mapper
 * Κανονικοποίηση BluePlug responses → UnifiedPoint
 */
class BluePlugMapper {
  static normalize(blueData) {
    if (!blueData) {
      throw new Error('BluePlug data is required');
    }

    try {
      const geoArray = blueData.geo || [0, 0];
      const longitude = geoArray[0] || 0;
      const latitude = geoArray[1] || 0;

      const unified = new UnifiedPoint({
        unifiedPointId: blueData.chargerId,
        providerName: 'bluePlug',
        currentStatus: blueData.currentStatus,
        reservationEndTime: blueData.reservationEnd || null,
        pricePerKwh: blueData.pricePerKwh || 0,
        coordinates: {
          longitude: longitude,
          latitude: latitude
        }
      });

      return unified;
    } catch (error) {
      console.error('[BluePlugMapper] Κανονικοποίηση error:', error.message);
      throw new Error(`Failed to normalize BluePlug data: ${error.message}`);
    }
  }

  static normalizeReservation(blueReservationData) {
    return this.normalize(blueReservationData);
  }
}

/**
 * Data Mapper Main Class
 * Επιλέγει τον κατάλληλο mapper βάσει του provider
 */
class ProviderDataMapper {
  /**
   * Κανονικοποίηση σημείου φόρτισης
   * @param {Object} point - Raw point data from any provider
   * @param {string} providerName - 'redPlug', 'greenPlug', 'bluePlug'
   * @returns {UnifiedPoint} Κανονικοποιημένο σημείο
   */
  static normalizePoint(point, providerName) {
    if (!providerName) {
      throw new Error('Provider name is required');
    }

    const provider = providerName.toLowerCase();

    if (provider === 'redplug' || provider === 'red') {
      return RedPlugMapper.normalize(point);
    } else if (provider === 'greenplug' || provider === 'green') {
      return GreenPlugMapper.normalize(point);
    } else if (provider === 'blueplug' || provider === 'blue') {
      return BluePlugMapper.normalize(point);
    } else {
      throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Κανονικοποίηση συλλογής σημείων
   * @param {Array} points - Array of raw points
   * @param {string} providerName - Provider name
   * @returns {Array} Array of UnifiedPoints
   */
  static normalizePoints(points, providerName) {
    if (!Array.isArray(points)) {
      throw new Error('Points must be an array');
    }

    return points.map(point => this.normalizePoint(point, providerName));
  }

  /**
   * Κανονικοποίηση κράτησης
   * @param {Object} reservation - Raw reservation data
   * @param {string} providerName - Provider name
   * @returns {UnifiedPoint} Κανονικοποιημένη κράτηση
   */
  static normalizeReservation(reservation, providerName) {
    const provider = providerName.toLowerCase();

    if (provider === 'redplug' || provider === 'red') {
      return RedPlugMapper.normalizeReservation(reservation);
    } else if (provider === 'greenplug' || provider === 'green') {
      return GreenPlugMapper.normalizeReservation(reservation);
    } else if (provider === 'blueplug' || provider === 'blue') {
      return BluePlugMapper.normalizeReservation(reservation);
    } else {
      throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Κανονικοποίηση ετερογενών σημείων (μικτοί providers)
   * Χρήσιμο όταν παίρνουμε δεδομένα από πολλούς providers ταυτόχρονα
   * 
   * @param {Array} mixedPoints - Points with providerName field
   * @returns {Array} Array of UnifiedPoints
   */
  static normalizeMixedPoints(mixedPoints) {
    if (!Array.isArray(mixedPoints)) {
      throw new Error('Mixed points must be an array');
    }

    return mixedPoints.map(point => {
      if (!point.providerName) {
        throw new Error('Each point must have a providerName field');
      }
      return this.normalizePoint(point, point.providerName);
    });
  }
}

// Εξαγωγές
export default ProviderDataMapper;
export { UnifiedPoint, RedPlugMapper, GreenPlugMapper, BluePlugMapper };
