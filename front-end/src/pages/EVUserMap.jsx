import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { pointsAPI } from '../utils/apiClient';
import MapView from '../components/MapView';
import InfoPanel from '../components/InfoPanel';
import Sidebar from '../components/Sidebar';

// Helper Haversine
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const normalizePoint = (point, userLocation) => {
  const pointid = String(point.pointid || point.point_id || point.pointId || point.id || point.unifiedPointId);
  const providerName = point.providerName || point.provider_name || 'Unknown';
  const status = point.status || point.currentStatus || 'offline';
  const cap = Number(point.cap ?? point.capacity_kw ?? point.capacityKw ?? point.kilowatts ?? point.power ?? 22);
  const kwhprice = Number(point.kwhprice ?? point.kwh_price ?? point.kwhPrice ?? point.pricePerKwh ?? 0.45);
  const connector = point.connector || point.connector_type || point.connectorType || null;

  let lat = Number(point.lat ?? point.latitude ?? point.coordinates?.latitude ?? 37.9755);
  let lon = Number(point.lon ?? point.longitude ?? point.coordinates?.longitude ?? 23.7348);

  if (lat < 30 && lon > 30) {
    [lat, lon] = [lon, lat];
  }

  // Map connector code to semantic name
  const connectorMap = {
    '3': 'Type 3',
    '7': 'CHAdeMO',
    '20': 'Type 2',
    '24': 'CCS2',
    'null': 'Other'
  };
  
  const connectorTypesSet = new Set();
  if (connector) {
    const semanticName = connectorMap[connector] || 'Other';
    connectorTypesSet.add(semanticName);
  } else {
    connectorTypesSet.add('Other');
  }

  const outlets = Array.isArray(point.outlets) && point.outlets.length > 0
    ? point.outlets
    : Array.isArray(point.connectors) && point.connectors.length > 0
      ? point.connectors
      : [{
          outlet_id: pointid,
          connector_type: connector,
          kilowatts: cap,
          status,
          kwhprice
        }];

  return {
    pointid,
    lat,
    lon,
    name: point.location_name || point.locationName || point.name || `${providerName} Station ${pointid}`,
    address: point.address || '',
    connector_types: Array.from(connectorTypesSet),
    kwhprice,
    cap,
    distance: calculateDistance(userLocation[0], userLocation[1], lat, lon),
    outlets,
    status,
    currentStatus: status,
    providerName,
    reservationEndTime: point.reservationEndTime || point.reservation_end_time || point.reservationendtime,
    charger_type: cap <= 22 ? 'AC' : 'DC'
  };
};

const EVUserMap = ({ setToken }) => {
  const [chargers, setChargers] = useState([]);
  const [filteredChargers, setFilteredChargers] = useState([]);
  const [selectedCharger, setSelectedCharger] = useState(null);
  const [userLocation, setUserLocation] = useState([37.9755, 23.7348]); 
  const [searchText, setSearchText] = useState("");
  const [gpsError, setGpsError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const userLocationRef = useRef(userLocation);
  const [windowWidth, setWindowWidth] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 1024;
  });

  const [filters, setFilters] = useState({
    costMin: 0.0,
    costMax: 10.0,
    dist: 100,
    powerMin: 0,
    powerMax: 350,
    avail: [],
    type: [],
    connectorTypes: []
  });

  useEffect(() => {
    const updateWidth = () => {
      const newWidth = window.innerWidth;
      setWindowWidth(newWidth);
      
      if (newWidth >= 768) {
        setSidebarOpen(false);
        setInfoPanelOpen(false);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    const checkTimeout = setTimeout(() => updateWidth(), 50);
    
    return () => {
      window.removeEventListener('resize', updateWidth);
      clearTimeout(checkTimeout);
    };
  }, []);

  useEffect(() => {
    const width = window.innerWidth;
    setWindowWidth(width);
  }, []);

  const isMobile = windowWidth < 768;

  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

  // SSE: real-time point status updates from Points Service
  useEffect(() => {
    const eventSource = new EventSource('/api/points/events');

    eventSource.onmessage = (event) => {
      try {
        const rawPoint = JSON.parse(event.data);
        const normalized = normalizePoint(rawPoint, userLocationRef.current);
        setChargers((prev) => prev.map((c) =>
          String(c.pointid) === String(normalized.pointid) ? normalized : c
        ));
        setSelectedCharger((current) =>
          current && String(current.pointid) === String(normalized.pointid) ? normalized : current
        );
      } catch (_) {}
    };

    return () => eventSource.close();
  }, []);

  // GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setUserLocation([p.coords.latitude, p.coords.longitude]);
          setGpsError(null);
        },
        (e) => {
          console.log("GPS error", e);
          if (e.code === e.PERMISSION_DENIED) {
            setGpsError("Location permission denied. Using default location (Athens, Greece).");
          }
        }
      );
    }
  }, []);

  // Search
  const handleSearch = async (e) => {
    if (e.key === 'Enter' && searchText.length > 0) {
      try {
        const res = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${searchText}`);
        if (res.data && res.data.length > 0) {
          setUserLocation([parseFloat(res.data[0].lat), parseFloat(res.data[0].lon)]);
        } else {
          alert("Location not found ⚠️");
        }
      } catch (err) { alert("Geocoding Error ❌"); }
    }
  };

  // Fetch Data from Points API (via Reservation Service)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = {
          lat: userLocation[0],
          lon: userLocation[1],
          costMin: filters.costMin,
          costMax: filters.costMax,
          powerMin: filters.powerMin,
          powerMax: filters.powerMax
        };

        if (filters.dist < 100) {
          params.radius = filters.dist;
        }

        if (filters.avail && filters.avail.length > 0) {
          params.avail = filters.avail.join(',');
        }

        if (filters.connectorTypes && filters.connectorTypes.length > 0) {
          params.connectorType = filters.connectorTypes.join(',');
        }

        if (filters.type && filters.type.length > 0) {
          params.type = filters.type.join(',');
        }

        // Fetch backend-filtered charging points
        const result = await pointsAPI.getAll(params);

        if (result.success && result.data) {
          const points = result.data.points || result.data || [];

          const normalized = points.map((point) => normalizePoint(point, userLocation));

          const sorted = [...normalized].sort((a, b) => a.distance - b.distance);

          setChargers(sorted);
          setFilteredChargers(sorted);
        } else {
          console.warn('Failed to fetch charging points:', result.error);
          setChargers([]);
          setFilteredChargers([]);
        }
      } catch (err) {
        console.error('Error fetching from Points API:', err);
        setChargers([]);
        setFilteredChargers([]);
      }
    };
    fetchData();
  }, [userLocation, filters]);

  const updatePointInState = (updatedPoint) => {
    setChargers((prev) => prev.map((charger) => (
      String(charger.pointid) === String(updatedPoint.pointid) ? updatedPoint : charger
    )));
    setSelectedCharger((current) => (
      current && String(current.pointid) === String(updatedPoint.pointid) ? updatedPoint : current
    ));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    setToken(null);
  };

  return (
    <div className="d-flex h-100" style={{ height: '100vh', overflow: 'hidden' }}>
      {/* Mobile Sidebar */}
      {isMobile && sidebarOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999 }}>
          <div onClick={() => setSidebarOpen(false)} style={{ height: '100%' }}></div>
        </div>
      )}

      {/* Desktop Sidebar / Mobile Overlay */}
      {(!isMobile || sidebarOpen) && (
        <div style={{ width: isMobile ? '75%' : '300px', position: isMobile ? 'fixed' : 'relative', zIndex: 1000, height: '100vh' }}>
          <Sidebar setFilters={setFilters} onLogout={handleLogout} onFiltersApplied={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-grow-1 d-flex flex-column">
        {/* Header */}
        <div className="bg-light border-bottom p-2">
          <div className="d-flex gap-2 align-items-center">
            {isMobile && (
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
                ☰ Filter
              </button>
            )}
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search location... (Press Enter)"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyPress={handleSearch}
            />
            {gpsError && <small className="text-warning">{gpsError}</small>}
          </div>
        </div>

        {/* Map & Info Panels */}
        <div className="flex-grow-1 d-flex position-relative" style={{ overflow: 'hidden' }}>
          {/* Map */}
          <div style={{ flex: 1, position: 'relative' }}>
            <MapView chargers={filteredChargers} onSelectCharger={(c) => { setSelectedCharger(c); setInfoPanelOpen(true); }} userLocation={userLocation} selectedCharger={selectedCharger} />
          </div>

          {/* Mobile Info Panel */}
          {isMobile && infoPanelOpen && selectedCharger && (
            <div className="position-fixed bottom-0 start-0 w-100" style={{ backgroundColor: 'white', maxHeight: '70vh', borderRadius: '20px 20px 0 0', zIndex: 1001, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)', overflowY: 'auto' }}>
              <InfoPanel
                charger={selectedCharger}
                filters={filters}
                onClose={() => { setInfoPanelOpen(false); setSelectedCharger(null); }}
              />
            </div>
          )}

          {/* Desktop Info Panel */}
          {!isMobile && selectedCharger && (
            <div style={{ width: '350px', borderLeft: '1px solid #dee2e6', overflowY: 'auto' }}>
              <InfoPanel
                charger={selectedCharger}
                filters={filters}
                onClose={() => setSelectedCharger(null)}
              />
            </div>
          )}
        </div>

        {/* Results List (Mobile) */}
        {isMobile && !infoPanelOpen && (
          <div className="border-top" style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: 'white' }}>
            <div className="p-3">
              <h6>Found {filteredChargers.length} stations</h6>
              <div className="d-grid gap-2">
                {filteredChargers.slice(0, 5).map((charger) => (
                  <div
                    key={charger.pointid}
                    className="btn btn-outline-primary text-start p-2"
                    onClick={() => { setSelectedCharger(charger); setInfoPanelOpen(true); }}
                  >
                    <strong>{charger.name}</strong>
                    <br />
                    <small className="text-muted">{charger.distance.toFixed(1)}km away • €{charger.kwhprice}/kWh</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EVUserMap;
