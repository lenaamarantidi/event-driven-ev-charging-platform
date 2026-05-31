import { useState, useEffect } from 'react';
import { reservationAPI } from '../utils/apiClient';
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

const normalizePoints = (locations, userLocation) => {
  if (!Array.isArray(locations)) return [];

  return locations.map((location) => {
    const lat = parseFloat(location.latitude);
    const lon = parseFloat(location.longitude);
    const distance = location.distance_km || calculateDistance(userLocation[0], userLocation[1], lat, lon);
    
    const connectorTypesSet = new Set();
    let firstOutletData = { kwhprice: 0.45, cap: 0 };
    
    if (Array.isArray(location.outlets) && location.outlets.length > 0) {
      location.outlets.forEach(outlet => {
        if (outlet.connector_type) {
          connectorTypesSet.add(outlet.connector_type);
        }
      });
      firstOutletData = {
        kwhprice: location.outlets[0].kwhprice || 0.45,
        cap: location.outlets[0].kilowatts || 0
      };
    }
    
    return {
      pointid: String(location.id),
      lat,
      lon,
      name: location.name || 'Unknown Location',
      address: location.address || '',
      connector_types: Array.from(connectorTypesSet),
      kwhprice: firstOutletData.kwhprice,
      cap: firstOutletData.cap,
      distance,
      outlets: location.outlets || []
    };
  });
};

const EVUserMap = ({ setToken }) => {
  const [chargers, setChargers] = useState([]);
  const [filteredChargers, setFilteredChargers] = useState([]);
  const [selectedCharger, setSelectedCharger] = useState(null);
  const [userLocation, setUserLocation] = useState([37.9755, 23.7348]); 
  const [searchText, setSearchText] = useState("");
  const [savedCard, setSavedCard] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
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
    type: []
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

  // Fetch Data from Reservation Service
  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await reservationAPI.getAll();
        const reservations = Array.isArray(result.data?.reservations)
          ? result.data.reservations
          : Array.isArray(result.data)
            ? result.data
            : [];

        if (result.success) {
          const normalized = reservations.map((point) => {
            const location = point.reservation_details || point.location || {};
            const latitude = location.latitude || location.lat || point.lat || 37.9755;
            const longitude = location.longitude || location.lon || point.lon || 23.7348;
            const outlets = Array.isArray(point.outlets) ? point.outlets : (location.outlets ? location.outlets : []);
            const price = point.pricePerKwh || location.pricePerKwh || location.kwhprice || point.kwhprice || 0.45;
            const cap = point.power || location.kwh || location.cap || 22;
            const providerName = point.providerName || point.provider_name || location.providerName || 'Provider';

            return {
              pointid: String(point.unifiedPointId || point.point_id || point.id || Math.random()),
              lat: parseFloat(latitude),
              lon: parseFloat(longitude),
              name: point.name || `${providerName} ${point.point_id || point.id || ''}`.trim(),
              address: point.address || location.address || '',
              connector_types: outlets.length > 0 ? outlets.map((o) => o.connector_type || o.type || 'Type 2') : ['Type 2'],
              kwhprice: price,
              cap,
              distance: calculateDistance(userLocation[0], userLocation[1], parseFloat(latitude), parseFloat(longitude)),
              outlets: outlets.length > 0 ? outlets.map((outlet) => ({
                outlet_id: outlet.outlet_id || outlet.id || point.point_id,
                connector_type: outlet.connector_type || outlet.type || 'Type 2',
                kilowatts: outlet.kilowatts || outlet.power || cap,
                status: outlet.status || point.status || point.currentStatus || 'available',
                kwhprice: outlet.kwhprice || outlet.pricePerKwh || price
              })) : [{
                outlet_id: point.point_id || point.id || `${providerName}-${Math.random()}`,
                connector_type: point.connector_types?.[0] || 'Type 2',
                kilowatts: cap,
                status: point.status || point.currentStatus || 'available',
                kwhprice: price
              }],
              currentStatus: point.status || point.currentStatus || 'available',
              providerName,
              reservationEndTime: point.reservationEndTime || point.reservedUntil || location.reservationEndTime
            };
          }).map((location) => ({
            ...location,
            charger_type: (location.cap || 0) <= 22 ? 'AC' : 'DC'
          }));

          setChargers(normalized);
        } else {
          console.warn('Could not load reservation points:', result.error);
          setChargers([]);
        }
      } catch (err) {
        console.error('Error fetching from Reservation Service:', err);
        setChargers([]);
      }
    };
    fetchData();
  }, [userLocation, filters]);

  // Apply Filters 
  useEffect(() => {
    let result = chargers;
    
    if (filters.avail.length > 0) {
      result = result.filter(location => {
        const outlets = Array.isArray(location.outlets) ? location.outlets : [];
        return filters.avail.some(status => {
          if (status === 'available') return outlets.some(o => o.status === 'available');
          if (status === 'occupied') return outlets.some(o => o.status === 'charging' || o.status === 'reserved');
          if (status === 'unavailable') return outlets.some(o => o.status === 'offline' || o.status === 'malfunction');
          if (status === 'booked_by_me') return outlets.some(o => o.status === 'booked_by_me');
          return false;
        });
      });
    }

    result = result.filter(l => {
      const price = l.kwhprice || 0;
      const kw = l.cap || 0;
      return price >= filters.costMin && price <= filters.costMax && kw >= filters.powerMin && kw <= filters.powerMax;
    });

    if (filters.type.length > 0) {
      result = result.filter(l => filters.type.includes(l.charger_type));
    }

    setFilteredChargers(result.sort((a, b) => a.distance - b.distance));
  }, [chargers, filters]);

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
              <div className="p-2">
                <button className="btn btn-close" onClick={() => setInfoPanelOpen(false)}></button>
              </div>
              <InfoPanel charger={selectedCharger} savedCard={savedCard} setSavedCard={setSavedCard} filters={filters} onClose={() => setInfoPanelOpen(false)} />
            </div>
          )}

          {/* Desktop Info Panel */}
          {!isMobile && selectedCharger && (
            <div style={{ width: '350px', borderLeft: '1px solid #dee2e6', overflowY: 'auto' }}>
              <InfoPanel charger={selectedCharger} savedCard={savedCard} setSavedCard={setSavedCard} filters={filters} onClose={() => setSelectedCharger(null)} />
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
