/**
 * Provider Data Mapper - Anti-Corruption Layer
 * 
 * Normalizes heterogeneous JSON responses from:
 * - redPlug (pointid, status, reservationendtime, long/lat)
 * - greenPlug (id, state, reservedUntil, kwhRateEur, coords.long/coords.lat)
 * - bluePlug (chargerId, currentStatus, reservationEnd, pricePerKwh, geo[])
 * 
 * Into unified schema:
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
 * Unified Point/Reservation Schema
 * This is what our frontend ALWAYS receives, regardless of provider
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
 * Maps RedPoint / RedReserveResponse → UnifiedPoint
 * 
 * RedPlug schema:
 * {
 *   pointid: integer,
 *   providerName: "redPlug",
 *   status: string,
 *   reservationendtime: string | null,
 *   cap: integer,
 *   connector: string | null,
 *   locationName: string | null,
 *   address: string | null,
 *   long: number,
 *   lat: number
 * }
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
        pricePerKwh: 0, // redPlug doesn't provide price in points list
        coordinates: {
          longitude: redData.long || 0,
          latitude: redData.lat || 0
        }
      });

      return unified;
    } catch (error) {
      console.error('[RedPlugMapper] Normalization error:', error.message);
      throw new Error(`Failed to normalize RedPlug data: ${error.message}`);
    }
  }

  /**
   * Map reservation response (may include additional fields)
   */
  static normalizeReservation(redReservationData) {
    // Same structure as point response
    return this.normalize(redReservationData);
  }
}

/**
 * GreenPlug Mapper
 * Maps GreenPoint / GreenReserveResponse → UnifiedPoint
 * 
 * GreenPlug schema:
 * {
 *   id: integer,
 *   providerName: "greenPlug",
 *   state: string,
 *   reservedUntil: string | null,
 *   kwhRateEur: number,
 *   cap: integer,
 *   connector: string | null,
 *   locationName: string | null,
 *   address: string | null,
 *   coords: {
 *     long: number,
 *     lat: number
 *   }
 * }
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
      console.error('[GreenPlugMapper] Normalization error:', error.message);
      throw new Error(`Failed to normalize GreenPlug data: ${error.message}`);
    }
  }

  /**
   * Map reservation response (may include additional fields)
   */
  static normalizeReservation(greenReservationData) {
    // Same structure as point response
    return this.normalize(greenReservationData);
  }
}

/**
 * BluePlug Mapper
 * Maps BluePoint / BlueReserveResponse → UnifiedPoint
 * 
 * BluePlug schema:
 * {
 *   chargerId: integer,
 *   providerName: "bluePlug",
 *   currentStatus: string,
 *   reservationEnd: string | null,
 *   pricePerKwh: number,
 *   cap: integer,
 *   connector: string | null,
 *   locationName: string | null,
 *   address: string | null,
 *   geo: [longitude, latitude]  // Array format
 * }
 */
class BluePlugMapper {
  static normalize(blueData) {
    if (!blueData) {
      throw new Error('BluePlug data is required');
    }

    try {
      // BluePlug uses geo array: [longitude, latitude]
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
      console.error('[BluePlugMapper] Normalization error:', error.message);
      throw new Error(`Failed to normalize BluePlug data: ${error.message}`);
    }
  }

  /**
   * Map reservation response (may include additional fields)
   */
  static normalizeReservation(blueReservationData) {
    // Same structure as point response
    return this.normalize(blueReservationData);
  }
}

/**
 * Main Provider Data Mapper
 * Routes normalization to the correct provider mapper
 */
class ProviderDataMapper {
  /**
   * Normalize a single point/reservation response
   * Auto-detects provider based on providerName field
   */
  static normalize(providerResponse) {
    if (!providerResponse) {
      throw new Error('Provider response is required');
    }

    const providerName = providerResponse.providerName;

    switch (providerName) {
      case 'redPlug':
        return RedPlugMapper.normalize(providerResponse);

      case 'greenPlug':
        return GreenPlugMapper.normalize(providerResponse);

      case 'bluePlug':
        return BluePlugMapper.normalize(providerResponse);

      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Normalize an array of responses (e.g., points list)
   */
  static normalizeArray(providerResponses) {
    if (!Array.isArray(providerResponses)) {
      throw new Error('Expected array of provider responses');
    }

    return providerResponses.map((response, index) => {
      try {
        return this.normalize(response);
      } catch (error) {
        console.error(`[ProviderDataMapper] Error normalizing item ${index}:`, error.message);
        // Return null for failed items, or throw depending on use case
        throw error;
      }
    });
  }

  /**
   * Normalize by explicit provider name
   * Useful when provider name might not be in the response
   */
  static normalizeByProvider(providerName, data) {
    if (!providerName || !data) {
      throw new Error('Provider name and data are required');
    }

    // Add providerName to data if not present
    const dataWithProvider = {
      ...data,
      providerName: providerName
    };

    return this.normalize(dataWithProvider);
  }
}

/**
 * Export everything
 */
module.exports = {
  UnifiedPoint,
  RedPlugMapper,
  GreenPlugMapper,
  BluePlugMapper,
  ProviderDataMapper
};
