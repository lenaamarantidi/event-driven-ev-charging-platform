import { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../config';
import { reservationAPI } from '../utils/apiClient';

const CONNECTOR_CODE_MAP = {
  '3': 'Type 3',
  '7': 'CHAdeMO',
  '20': 'Type 2',
  '24': 'CCS2',
};

const resolveConnectorName = (value) => {
  if (!value || value === '—') return '—';
  return CONNECTOR_CODE_MAP[String(value)] || value;
};

const InfoPanel = ({ charger, filters, onClose }) => {
    const [state, setState] = useState('idle'); // idle, reserving
    const [modalWarning, setModalWarning] = useState(false);
  
  // Reservation State
  const [resDuration, setResDuration] = useState(30);

    const [connectorPricing, setConnectorPricing] = useState([]);
    const [selectedConnectorType, setSelectedConnectorType] = useState('');
    const [outletOptions, setOutletOptions] = useState([]);
    const [selectedOutletId, setSelectedOutletId] = useState('');
    const [locationDetails, setLocationDetails] = useState(null);

    // Filter outlets based on active filters
    const getFilteredOutlets = () => {
        if (!outletOptions || outletOptions.length === 0) return [];
        
        return outletOptions.filter(outlet => {
            // Availability filter
            if (filters?.avail?.length > 0) {
                const outletStatus = outlet.status;
                const isMatching = 
                    (filters.avail.includes('available') && outletStatus === 'available') ||
                    (filters.avail.includes('occupied') && (outletStatus === 'charging' || outletStatus === 'reserved')) ||
                    (filters.avail.includes('unavailable') && (outletStatus === 'offline' || outletStatus === 'malfunction'));
                if (!isMatching) return false;
            }
            
            // Price filter
            const price = outlet.kwhprice || 0;
            if (price < filters?.costMin || price > filters?.costMax) return false;
            
            // Capacity filter
            if (filters?.powerMin >= 0 && filters?.powerMax > 0) {
                const kw = outlet.kilowatts || 0;
                if (kw < filters.powerMin || kw > filters.powerMax) return false;
            }
            
            // Charger type filter (AC/DC)
            if (filters?.type?.length > 0) {
                const kilowatts = outlet.kilowatts || 0;
                const outletType = kilowatts <= 22 ? 'AC' : 'DC';
                if (!filters.type.includes(outletType)) return false;
            }
            
            return true;
        });
    };

    const filteredOutletOptions = getFilteredOutlets();
    const selectedPrice = connectorPricing.find(p => p.connector_type === selectedConnectorType)?.price_per_kwh;
    const activeOutlet = filteredOutletOptions.find(o => String(o.outlet_id) === String(selectedOutletId));
    const outletPrice = activeOutlet?.kwhprice;
    const price = (selectedPrice ?? outletPrice ?? charger.kwhprice) || 0;
    const locationName = charger.name || 'Charging Location';
    const locationAddress = charger.address || '—';
    const distanceKm = charger.distance ?? charger.distance_km ?? 0;
    const outletStatusRaw = activeOutlet?.status || charger.status || 'unavailable';
    const outletStatus = outletStatusRaw === 'booked_by_me'
        ? 'booked by me'
        : outletStatusRaw === 'available'
            ? 'available'
            : (outletStatusRaw === 'charging' || outletStatusRaw === 'reserved')
                ? 'occupied'
                : (outletStatusRaw === 'offline' || outletStatusRaw === 'malfunction')
                    ? 'unavailable'
                    : 'unavailable';
    const outletConnectorType = resolveConnectorName(activeOutlet?.connector_type || selectedConnectorType || charger.connector || '—');
    const outletKilowatts = activeOutlet?.kilowatts ?? charger.cap ?? 0;
    const estimatedKwh = (charger.cap * 0.8) * (resDuration / 60.0);
  const estimatedCost = estimatedKwh * price;

    useEffect(() => {
        if (!activeOutlet?.connector_type) return;
        setSelectedConnectorType(activeOutlet.connector_type);
    }, [activeOutlet]);

    // Reset state to idle when charger changes (different pin clicked)
    useEffect(() => {
        setState('idle');
    }, [charger?.pointid]);

    useEffect(() => {
        setConnectorPricing([]);
        setSelectedConnectorType('');
        setOutletOptions([]);
        setSelectedOutletId('');
        setLocationDetails(null);

        const fetchPricing = async () => {
            if (!charger?.pointid) return;

            const pointId = String(charger.pointid);
            
            // Try to use outlets from charger object first
            if (Array.isArray(charger.outlets) && charger.outlets.length > 0) {
                setOutletOptions(charger.outlets);
                setSelectedOutletId(String(charger.outlets[0].outlet_id));
                return;
            }

            // Otherwise fetch from API
            try {
                const res = await axios.get(`${BASE_URL}/ui/location/${charger.pointid}`);
                setLocationDetails(res.data || null);

                // Parse outlets directly from res.data.outlets
                const outlets = Array.isArray(res.data.outlets) 
                    ? res.data.outlets.map(outlet => ({
                        outlet_id: outlet.outlet_id,
                        connector_type: outlet.connector_type || '',
                        kilowatts: outlet.kilowatts || 0,
                        status: outlet.status || 'unknown',
                        kwhprice: outlet.kwhprice || 0.45
                    }))
                    : [];

                setOutletOptions(outlets);
                if (outlets.length > 0) {
                    setSelectedOutletId(String(outlets[0].outlet_id));
                }
            } catch (err) {
                console.error(err);
                setOutletOptions([]);
            }
        };
        fetchPricing();
    }, [charger]);

  // Navigation
    const handleNavigate = () => {
        if (outletStatus === 'unavailable' || outletStatus === 'offline' || activeOutlet?.status === 'malfunction') {
            setModalWarning(true);
            return;
        }
        try {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${charger.lat},${charger.lon}`;
            const newWindow = window.open(url, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                alert('⚠️ Unable to retrieve navigation directions. Please check your popup blocker settings and try again.');
            }
        } catch (error) {
            alert('⚠️ Unable to retrieve navigation directions. Please try again later.');
        }
    };

    const handleNavigateConfirm = () => {
        try {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${charger.lat},${charger.lon}`;
            const newWindow = window.open(url, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                alert('⚠️ Unable to retrieve navigation directions. Please check your popup blocker settings and try again.');
            }
            setModalWarning(false);
        } catch (error) {
            alert('⚠️ Unable to retrieve navigation directions. Please try again later.');
            setModalWarning(false);
        }
    };

  // Handlers

        const handleReserve = async () => {
        if (!resDuration || resDuration < 15 || resDuration > 60) {
            alert("Duration must be between 15 and 60 minutes");
            return;
        }

    try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert("Please log in to make a reservation");
                return;
            }

            if (!charger.pointid) {
                alert("Missing charging point id");
                return;
            }

            const result = await reservationAPI.createReservation({
                pointId: String(charger.pointid),
                minutes: parseInt(resDuration),
                providerName: charger.providerName
            });

            if (!result.success) {
                throw new Error(result.error || 'Unable to create reservation.');
            }

            const reservation = result.data;
            alert(`Reservation Confirmed!\n\nPoint: ${reservation.pointid || charger.pointid}\nStatus: ${reservation.status || 'reserved'}\nUntil: ${reservation.reservationendtime || '—'}\nDuration: ${resDuration} min\nEstimated Cost: €${estimatedCost.toFixed(2)}`);
            setState('idle');
            onClose();
        } catch (err) {
            const message = err?.response?.data?.error || "Error: Unable to create reservation.";
            alert(message);
        }
  };

  // Rendering

  return (
    <div>
                <h3 className="mb-3">{locationName}</h3>
        
        <div className="card p-3 mb-3">
                        <p className="mb-1"><strong>Address:</strong> {locationAddress}</p>
                        <p className="mb-1"><strong>Distance:</strong> {Number(distanceKm).toFixed(2)} km</p>
        </div>

                <div className="card p-3 mb-3">
                        <p className="mb-1"><strong>Connector:</strong> {outletConnectorType}</p>
                        <p className="mb-1"><strong>Status:</strong> {outletStatus}</p>
                        <p className="mb-1"><strong>Capacity:</strong> {Number(outletKilowatts || 0)} kW</p>
                        <p className="mb-1"><strong>Price:</strong> €{Number(price || 0).toFixed(2)}/kWh</p>
                </div>

        {connectorPricing.length > 0 && (
            <div className="card p-3 mb-3">
                <label className="form-label fw-bold mb-2">Select Connector & Price</label>
                <div className="d-flex gap-2 align-items-center">
                    <select 
                        className="form-select form-select-sm flex-grow-1"
                        value={selectedConnectorType}
                        onChange={(e) => setSelectedConnectorType(e.target.value)}
                    >
                        <option value="">-- Choose Connector --</option>
                        {connectorPricing.map((item) => (
                            <option key={item.connector_type} value={item.connector_type}>
                                {item.connector_type}
                            </option>
                        ))}
                    </select>
                    <span className="badge bg-primary text-white fs-6">€{price.toFixed(2)}/kWh</span>
                </div>
            </div>
        )}

            {modalWarning && (
                <div className="alert alert-warning">
                    <div className="fw-bold mb-2">⚠️ The selected charger is not currently available.</div>
                    <div className="mb-2">Are you sure you want to continue navigation?</div>
                    
                    {/* Alternative chargers nearby */}
                    {(() => {
                        // Get other locations within 5km that have available outlets
                        const nearbyAvailable = (window.allChargers || [])
                            .filter(c => 
                                c.pointid !== charger.pointid && 
                                c.distance_km && c.distance_km <= 5 &&
                                Array.isArray(c.outlets) && c.outlets.some(o => o.status === 'available')
                            )
                            .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0))
                            .slice(0, 3);
                        
                        if (nearbyAvailable.length > 0) {
                            return (
                                <div className="mt-3 mb-2">
                                    <p className="mb-2 fw-bold">Alternative chargers nearby:</p>
                                    <ul className="list-group list-group-flush">
                                        {nearbyAvailable.map(alt => (
                                            <li key={alt.pointid} className="list-group-item bg-transparent border-secondary p-2">
                                                <div className="fw-bold">{alt.name}</div>
                                                <small className="text-muted">{alt.distance_km?.toFixed(2)} km away</small>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        }
                        return null;
                    })()}
                    
                    <div className="d-flex gap-2">
                        <button className="btn btn-sm btn-warning" onClick={handleNavigateConfirm}>Yes, Navigate</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setModalWarning(false)}>No, Cancel</button>
                    </div>
                </div>
            )}

            <div className="d-grid gap-2 mb-3">
                <button className="btn btn-outline-success" onClick={handleNavigate}>
                    🗺️ Navigate (Google Maps)
                </button>
            </div>

      <hr />

      {/* Idle State */}
      {state === 'idle' && (
        <div className="d-grid">
            <button className="btn btn-primary w-100"
                onClick={() => {
                    if (outletStatus === 'unavailable') {
                        alert("Selected point is currently unavailable.");
                        return;
                    }
                    setState('reserving');
                }}>
                Reserve
            </button>
        </div>
      )}

      {/* Reservation State */}
      {state === 'reserving' && (
          <div>
              <h5>Reservation Details</h5>
                            {connectorPricing.length > 0 && (
                                <div className="mb-2">
                                    <label className="form-label">Connector Type</label>
                                    <select
                                        className="form-select"
                                        value={selectedConnectorType}
                                        onChange={(e) => setSelectedConnectorType(e.target.value)}
                                    >
                                        {connectorPricing.map((item) => (
                                            <option key={item.connector_type} value={item.connector_type}>
                                                {item.connector_type} (€{Number(item.price_per_kwh).toFixed(2)}/kWh)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
              <label>Duration: {resDuration} min</label>
            <input type="range" className="form-range" min="15" max="60" step="15" 
                     value={resDuration} onChange={e => setResDuration(e.target.value)} />
              
              <div className="alert alert-info py-2 text-dark">
                  <div>Est. Cost: <strong>~{estimatedCost.toFixed(2)} €</strong></div>
              </div>

              <div className="row g-2">
                  <div className="col-6">
                      <button className="btn btn-secondary w-100" onClick={() => setState('idle')}>❌ Cancel</button>
                  </div>
                  <div className="col-6">
                      <button className="btn btn-primary w-100" onClick={handleReserve}>✅ Confirm</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default InfoPanel;
