import { useState, useEffect, useLayoutEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../config';
import MapView from '../components/MapView';
import InfoPanel from '../components/InfoPanel';
import Sidebar from '../components/Sidebar';
import Account from '../components/Account';

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
    
    // Extract unique connector types from all outlets
    const connectorTypesSet = new Set();
    let firstOutletData = { kwhprice: 0.45, cap: 0 };
    
    if (Array.isArray(location.outlets) && location.outlets.length > 0) {
      location.outlets.forEach(outlet => {
        if (outlet.connector_type) {
          connectorTypesSet.add(outlet.connector_type);
        }
      });
      // Use first outlet's data as default
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

const Home = ({ setToken }) => {
  const [activeTab, setActiveTab] = useState('home'); 
  const [chargers, setChargers] = useState([]);
  const [filteredChargers, setFilteredChargers] = useState([]);
  const [selectedCharger, setSelectedCharger] = useState(null);
  const [userLocation, setUserLocation] = useState([37.9755, 23.7348]); 
  const [searchText, setSearchText] = useState("");
  const [savedCard, setSavedCard] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [noChargersMessage, setNoChargersMessage] = useState(null);

  // Mobile State Variables
  const [sidebarOpen, setSidebarOpen] = useState(false);      // Controls filter sidebar visibility
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);  // Controls charger info panel visibility
  const [windowWidth, setWindowWidth] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth : 1024;
  });

  // Filters State
  const [filters, setFilters] = useState({
    costMin: 0.0,
    costMax: 10.0,
    dist: 100,
    powerMin: 0,
    powerMax: 350,
    avail: [],
    type: []
  });

  // Track window width for responsive design
  useLayoutEffect(() => {
    const updateWidth = () => {
      const newWidth = window.innerWidth;
      setWindowWidth(newWidth);
      
      // Close mobile overlays when switching back to desktop
      if (newWidth >= 768) {
        setSidebarOpen(false);
        setInfoPanelOpen(false);
      }
    };

    updateWidth(); // Set initial value
    window.addEventListener('resize', updateWidth);
    
    const checkTimeout = setTimeout(() => updateWidth(), 50);
    
    return () => {
      window.removeEventListener('resize', updateWidth);
      clearTimeout(checkTimeout);
    };
  }, []);

  // Additional check after mount for DevTools responsive mode
  useEffect(() => {
    const width = window.innerWidth;
    setWindowWidth(width);
  }, []);

  // Calculate if mobile
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
          } else if (e.code === e.POSITION_UNAVAILABLE) {
            setGpsError("Unable to retrieve current location. Using default location.");
          } else if (e.code === e.TIMEOUT) {
            setGpsError("Location request timed out. Using default location.");
          } else {
            setGpsError("Unable to retrieve current location. Please try again later.");
          }
        }
      );
    } else {
      setGpsError("Geolocation is not supported by your browser. Using default location.");
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

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = {
          lat: userLocation[0],
          lon: userLocation[1]
        };
        
        // Only add distance limit if < 100 (100+ means unlimited)
        if (filters.dist < 100) {
          params.max_distance_km = filters.dist;
        }

        const token = localStorage.getItem('token');
        const res = await axios.get(`${BASE_URL}/ui/locations`, {
          params,
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const normalized = normalizePoints(res.data, userLocation).map((location) => ({
          ...location,
          charger_type: (location.cap || 0) <= 22 ? 'AC' : 'DC'
        }));
        setChargers(normalized);
        // Store all chargers globally for alternative suggestions
        window.allChargers = normalized;
      } catch (err) { console.error(err); }
    };
    fetchData();
  }, [userLocation, filters]);

  // Apply Filters 
  useEffect(() => {
    let result = chargers;
    
    // Availability filter - check if location has at least one outlet matching selected statuses
    if (filters.avail.length > 0) {
      result = result.filter(location => {
        const outlets = location.outlets || [];
        return outlets.some(outlet => {
          const outletStatus = outlet.status;
          // Map outlet status to filter status values
          if (filters.avail.includes('available') && outletStatus === 'available') return true;
          if (filters.avail.includes('occupied') && (outletStatus === 'charging' || outletStatus === 'reserved')) return true;
          if (filters.avail.includes('unavailable') && (outletStatus === 'offline' || outletStatus === 'malfunction')) return true;
          if (filters.avail.includes('booked_by_me') && outletStatus === 'booked_by_me') return true;
          return false;
        });
      });
    }
    
    // Price filter - check if location has at least one outlet in price range
    result = result.filter(location => {
      const outlets = location.outlets || [];
      if (outlets.length === 0) return false;
      return outlets.some(outlet => {
        const price = outlet.kwhprice || 0;
        return price >= filters.costMin && price <= filters.costMax;
      });
    });
    
    // Power filter - check if location has at least one outlet within power range
    if (filters.powerMin >= 0 && filters.powerMax > 0) {
      result = result.filter(location => {
        const outlets = location.outlets || [];
        return outlets.some(outlet => {
          const kw = outlet.kilowatts || 0;
          return kw >= filters.powerMin && kw <= filters.powerMax;
        });
      });
    }
    
    // Charger type filter (AC/DC) - check if location has outlets matching type
    if (filters.type.length > 0) {
      result = result.filter(location => {
        const outlets = location.outlets || [];
        return outlets.some(outlet => {
          const kilowatts = outlet.kilowatts || 0;
          const outletType = kilowatts <= 22 ? 'AC' : 'DC';
          return filters.type.includes(outletType);
        });
      });
    }
    
    // Filter by connector types
    if (filters.connectorTypes && filters.connectorTypes.length > 0) {
      result = result.filter(c => {
        const chargerConnectors = c.connector_types || [];
        const hasMatch = filters.connectorTypes.some(selected => 
          selected === 'Other' 
            ? chargerConnectors.length === 0  // Show locations with no connector types
            : chargerConnectors.includes(selected)  // Show locations with this connector
        );
        return hasMatch;
      });
    }
    
    // Distance filter (skip if 100+ = unlimited)
    if (filters.dist < 100) {
      result = result.filter(c => c.distance <= filters.dist);
    }
    
    setFilteredChargers(result);
    
    // Show message if no chargers match filters
    if (result.length === 0 && chargers.length > 0) {
      setNoChargersMessage("No available chargers with the selected filters. Try adjusting your filters.");
    } else {
      setNoChargersMessage(null);
    }
  }, [filters, chargers]);

  // Logout Function 
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    setToken(null); 
  };

  return (
    <div className="d-flex flex-column vh-100">
      
      {/* NAVBAR */}
      <nav className="navbar px-2 px-sm-3 border-bottom flex-shrink-0" 
           style={{ height: isMobile ? 'auto' : '56px', zIndex: 1050, minHeight: '56px', position: 'relative', backgroundColor: '#2d1f47', borderBottomColor: '#ffd700', borderBottomWidth: '2px' }}>
        <div className={`container-fluid d-flex ${isMobile ? 'flex-column' : 'align-items-center'} p-0`}>
          
          {/* Top Row - Hamburger & Brand (Mobile) or Brand only (Desktop) */}
          <div className="d-flex align-items-center w-100" style={{ marginBottom: isMobile ? '8px' : '0' }}>
            {/* Hamburger - Mobile Only */}
            {isMobile && (
              <button 
                className="btn btn-link text-white text-decoration-none p-0 me-2"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{ fontSize: '24px', minWidth: '40px', flexShrink: 0 }}
                title="Toggle Filters"
              >
                ☰
              </button>
            )}
            
            {/* Brand */}
            <div className="d-flex align-items-center">
              <span className="navbar-brand mb-0 h1 text-white" 
                    style={{ fontSize: isMobile ? '1rem' : '1.25rem', marginRight: isMobile ? '0' : '1rem' }}>
                ⚡ charger.io
              </span>
            </div>
          </div>
          
          {/* Bottom Row - Search & Buttons (Mobile) or Search & Buttons inline (Desktop) */}
          <div className="d-flex w-100 gap-2" style={{ alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
            {/* Search - Full width on mobile, flexible on desktop */}
            <div style={{ flex: isMobile ? '1' : '0 1 400px', minWidth: '0' }}>
              <input 
                type="text" 
                className="form-control form-control-sm" 
                placeholder={isMobile ? "🔍 Search..." : "🔍 Search location"} 
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleSearch}
                style={{ fontSize: isMobile ? '14px' : '14px', backgroundColor: '#1a1428', color: '#f5f1ff', borderColor: '#5d4a80' }}
              />
            </div>
            
            {/* Nav Buttons - Only on desktop, styled with solid backgrounds */}
            {!isMobile && (
              <div className="btn-group" style={{ flexShrink: 0, display: 'flex', gap: '0' }}>
                <button className="btn btn-sm" 
                        onClick={() => setActiveTab('home')}
                        style={{ fontSize: '14px', padding: '6px 16px', backgroundColor: activeTab === 'home' ? '#b366ff' : '#1a1428', color: '#f5f1ff', border: '1px solid #5d4a80', borderRight: 'none', cursor: 'pointer', transition: 'background-color 0.2s' }}>
                  HOME
                </button>
                <button className="btn btn-sm" 
                        onClick={() => setActiveTab('account')}
                        style={{ fontSize: '14px', padding: '6px 16px', backgroundColor: activeTab === 'account' ? '#b366ff' : '#1a1428', color: '#f5f1ff', border: '1px solid #5d4a80', borderLeft: 'none', cursor: 'pointer', transition: 'background-color 0.2s' }}>
                  ACCOUNT
                </button>
              </div>
            )}
            
            {/* Nav Buttons - Mobile version in search row */}
            {isMobile && (
              <div className="btn-group" style={{ flexShrink: 0, display: 'flex', gap: '0' }}>
                <button className="btn btn-sm" 
                        onClick={() => setActiveTab('home')}
                        style={{ fontSize: '14px', padding: '4px 8px', backgroundColor: activeTab === 'home' ? '#b366ff' : '#1a1428', color: '#f5f1ff', border: '1px solid #5d4a80', borderRight: 'none', cursor: 'pointer' }}>
                  🏠
                </button>
                <button className="btn btn-sm" 
                        onClick={() => setActiveTab('account')}
                        style={{ fontSize: '14px', padding: '4px 8px', backgroundColor: activeTab === 'account' ? '#b366ff' : '#1a1428', color: '#f5f1ff', border: '1px solid #5d4a80', borderLeft: 'none', cursor: 'pointer' }}>
                  👤
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <div className="d-flex flex-grow-1 overflow-hidden position-relative" style={{ height: 'calc(100vh - 56px)', zIndex: 1 }}>
        
        {activeTab === 'account' && (
          <div className="w-100 overflow-auto" style={{ backgroundColor: '#1a1428' }}>
             <Account savedCard={savedCard} setSavedCard={setSavedCard} />
          </div>
        )}

        {activeTab === 'home' && (
          <>
            {/* CONDITIONAL RENDERING based on isMobile */}
            {isMobile ? (
              /* ===== MOBILE LAYOUT ===== */
              <div className="h-100 w-100 d-flex flex-column position-relative">
                
                {/* Mobile Sidebar Overlay */}
                {sidebarOpen && (
                  <div 
                    className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-50" 
                    style={{ zIndex: 1040 }}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <div 
                      className="p-3" 
                      style={{ 
                        width: '90vw',
                        maxWidth: '320px',
                        height: '100%',
                        maxHeight: '100%',
                        overflowY: 'auto',
                        WebkitOverflowScrolling: 'touch',
                        boxSizing: 'border-box',
                        backgroundColor: '#2d1f47'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Sidebar setFilters={setFilters} onLogout={handleLogout} />
                    </div>
                  </div>
                )}

                {/* Mobile Map */}
                <div className="flex-grow-1 position-relative">
                  <MapView 
                    chargers={filteredChargers} 
                    userLocation={userLocation} 
                    onSelectCharger={(charger) => {
                      setSelectedCharger(charger);
                      setInfoPanelOpen(true);
                    }}
                    selectedCharger={selectedCharger} 
                  />
                </div>

                {/* Mobile Bottom Sheet Info Panel */}
                {selectedCharger && infoPanelOpen && (
                  <div 
                    className="mobile-info-panel position-absolute bottom-0 start-0 w-100"
                    style={{ maxHeight: '75vh', height: 'auto', zIndex: 1030, borderRadius: '15px 15px 0 0', display: 'flex', flexDirection: 'column', backgroundColor: '#2d1f47', borderTopColor: '#ffd700', borderTopWidth: '2px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="d-flex justify-content-between p-2 border-bottom border-secondary" style={{ flexShrink: 0 }}>
                      <strong>📍 Details</strong>
                      <button className="btn-close btn-close-white" 
                              onClick={() => setInfoPanelOpen(false)}></button>
                    </div>
                    <div className="p-3 overflow-auto" style={{ flex: 1, minHeight: 0 }}>
                      <InfoPanel 
                        charger={selectedCharger} 
                        savedCard={savedCard} 
                        setSavedCard={setSavedCard}
                        filters={filters}
                        onClose={() => setInfoPanelOpen(false)}
                      />
                    </div>
                  </div>
                )}
              </div>

            ) : (
              /* ===== DESKTOP LAYOUT ===== */
              <div className="h-100 w-100 d-flex">
                {/* Desktop Sidebar (Fixed Width) */}
                <div style={{ width: '300px', minWidth: '300px', backgroundColor: '#2d1f47', borderEndColor: '#5d4a80', borderEndWidth: '1px' }} 
                     className="h-100 overflow-auto">
                  <Sidebar setFilters={setFilters} onLogout={handleLogout} />
                </div>

                {/* Desktop Map Area */}
                <div className="flex-grow-1 position-relative h-100">
                  <MapView 
                    chargers={filteredChargers} 
                    userLocation={userLocation} 
                    onSelectCharger={setSelectedCharger}
                    selectedCharger={selectedCharger} 
                  />
                  
                  {/* Desktop Slide-over Panel */}
                  {selectedCharger && (
                    <div 
                      className="position-absolute top-0 end-0 h-100 d-flex flex-column"
                      style={{ width: '400px', zIndex: 1020, backgroundColor: '#2d1f47', borderLeftColor: '#5d4a80', borderLeftWidth: '1px' }}
                    >
                      <div className="p-2 text-end" style={{ flexShrink: 0 }}>
                        <button className="btn-close btn-close-white" 
                                onClick={() => setSelectedCharger(null)}></button>
                      </div>
                      <div className="p-3" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                        <InfoPanel 
                          charger={selectedCharger} 
                          savedCard={savedCard} 
                          setSavedCard={setSavedCard}
                          reservationWindow={filters.filterMode === 'reservation' ? {
                            resDate: filters.resDate,
                            resTime: filters.resTime,
                            resDuration: filters.resDuration
                          } : null}
                          onClose={() => setSelectedCharger(null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Home;