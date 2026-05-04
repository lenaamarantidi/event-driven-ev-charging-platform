import { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../config';

const InfoPanel = ({ charger, savedCard, setSavedCard, filters, onClose }) => {
    const [state, setState] = useState('idle'); // idle, reserving, payment, charging, summary
    const [modalWarning, setModalWarning] = useState(false);
  
  // Reservation State
    const [resDate, setResDate] = useState(new Date().toISOString().split('T')[0]);
    const [resTime, setResTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [resDuration, setResDuration] = useState(30);
  
  // Payment State
  const [payMethod, setPayMethod] = useState(savedCard ? 'saved' : 'new');
  const [cardDetails, setCardDetails] = useState({ number: '', exp: '', cvv: '' });
  const [saveCheck, setSaveCheck] = useState(false);

  // Simulation State
    const [progress, setProgress] = useState(0);
    const [sessionMetrics, setSessionMetrics] = useState({ kwh: 0, cost: 0 });
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
                    (filters.avail.includes('unavailable') && (outletStatus === 'offline' || outletStatus === 'malfunction')) ||
                    (filters.avail.includes('booked_by_me') && outletStatus === 'booked_by_me');
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
    const outletConnectorType = activeOutlet?.connector_type || selectedConnectorType || '—';
    const outletKilowatts = activeOutlet?.kilowatts ?? charger.cap ?? 0;
    const estimatedKwh = (charger.cap * 0.8) * (resDuration / 60.0);
  const estimatedCost = estimatedKwh * price;
    const startDateTime = new Date(`${resDate}T${resTime}`);
    const endDateTime = new Date(startDateTime.getTime() + resDuration * 60000);
    const formatTime = (date) => (isNaN(date.getTime()) ? '--:--' : date.toTimeString().slice(0, 5));

    useEffect(() => {
        setPayMethod(savedCard ? 'saved' : 'new');
    }, [savedCard]);

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
        const startDateTime = new Date(`${resDate}T${resTime}`);
        if (isNaN(startDateTime.getTime())) {
            alert("Invalid date/time");
            return;
        }
        if (startDateTime < new Date()) {
            alert("Invalid time! Start time cannot be in the past.");
            return;
        }
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

            const outletId = selectedOutletId || charger.pointid;
            if (!outletId) {
                alert("Please select an outlet");
                return;
            }

            // Call new /ui/reserve endpoint with full schedule details
            const response = await axios.post(
                `${BASE_URL}/ui/reserve`,
                {
                    outlet_id: parseInt(outletId),
                    requested_date: resDate,
                    requested_start_time: resTime,
                    requested_duration_minutes: parseInt(resDuration)
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            const reservation = response.data;
            alert(`Reservation Confirmed!\n\nDate: ${reservation.requested_date}\nTime: ${reservation.requested_start_time} - ${reservation.requested_end_time}\nDuration: ${reservation.duration_minutes} min\nEstimated Cost: €${reservation.estimated_cost.toFixed(2)}`);
            setState('idle');
            onClose(); 
        } catch (err) {
            const message = err?.response?.data?.error || "Error: Unable to create reservation.";
            alert(message);
        }
  };

  const handleStartCharging = () => {
        if (charger.status !== 'available') {
            alert("Charger is currently busy/offline.");
            return;
        }
    if (payMethod === 'new') {
        if (!cardDetails.number || !cardDetails.exp || !cardDetails.cvv) {
            alert("Please fill in card details");
            return;
        }
        if (saveCheck) {
            setSavedCard(cardDetails);
        }
    }
    setState('charging');
  };

 
  const handleFinishSession = async () => {
      const now = new Date();
      // Προσομοίωση ότι ξεκίνησε πριν 50 λεπτά
      const startTime = new Date(now.getTime() - 50 * 60000); 

      // Helper για μορφοποίηση ημερομηνίας σε "YYYY-MM-DD HH:mm"
      const formatDate = (date) => {
          return date.toISOString().slice(0, 16).replace('T', ' ');
      };

      const payload = {
          id: selectedOutletId || charger.pointid,
          starttime: formatDate(startTime),
          endtime: formatDate(now),
          startsoc: 20, 
          endsoc: 90,
          totalkwh: parseFloat(sessionMetrics.kwh),
          kwhprice: parseFloat(price),
          amount: parseFloat(sessionMetrics.cost)
      };

      try {
          await axios.post(`${BASE_URL}/newsession`, payload);
          alert("Session Saved to History! ✅");
      } catch (error) {
          console.error("Failed to save session:", error);
          alert("Error saving history ❌");
      }

      setState('idle');
      onClose();
  };

  // Charging Simulation Effect
  useEffect(() => {
    if (state === 'charging') {
        let p = 0;
        const interval = setInterval(() => {
            p += 1;
            setProgress(p);
            // Simulate values: 15 kWh total
            const kwh = (p * 0.15);
            setSessionMetrics({
                kwh: kwh.toFixed(1),
                cost: (kwh * price).toFixed(2)
            });

            if (p >= 100) {
                clearInterval(interval);
                setState('summary');
            }
        }, 30); // Speed of simulation
        return () => clearInterval(interval);
    }
  }, [state, price]);

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

        {filteredOutletOptions.length > 0 && (
            <div className="card p-3 mb-3">
                <label className="form-label fw-bold mb-2">Select Outlet {outletOptions.length > filteredOutletOptions.length && `(${filteredOutletOptions.length}/${outletOptions.length})`}</label>
                <select
                    className="form-select form-select-sm"
                    value={selectedOutletId}
                    onChange={(e) => setSelectedOutletId(e.target.value)}
                >
                    {filteredOutletOptions.map((outlet, index) => (
                        <option key={outlet.outlet_id ?? index} value={outlet.outlet_id}>
                            ID: {outlet.outlet_id} | {outlet.connector_type || 'Unknown'} • {outlet.kilowatts || 0}kW
                        </option>
                    ))}
                </select>
            </div>
        )}

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
        <div className="row g-2">
            <div className="col-6">
                                <button className="btn btn-primary w-100" 
                                                onClick={() => {
                                                    if (outletStatus === 'unavailable') {
                                                        alert("Selected outlet is unavailable!");
                                                        return;
                                                    }
                                                    setState('payment');
                                                }}>
                    ⚡ Charge
                </button>
            </div>
            <div className="col-6">
                                <button className="btn btn-secondary w-100" 
                                                onClick={() => {
                                                    if (outletStatus === 'unavailable') {
                                                        alert("Selected outlet is currently unavailable. Please select an available outlet.");
                                                        return;
                                                    }
                                                    setState('reserving');
                                                }}>
                    📅 Reserve
                </button>
            </div>
        </div>
      )}

      {/* Reservation State */}
      {state === 'reserving' && (
          <div>
              <h5>📅 Reservation Details</h5>
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
              <div className="row g-2 mb-2">
                  <div className="col-6">
                      <label className="form-label">Date</label>
                      <input type="date" className="form-control"
                             value={resDate} onChange={e => setResDate(e.target.value)} />
                  </div>
                  <div className="col-6">
                      <label className="form-label">Start Time</label>
                      <input type="time" className="form-control"
                             value={resTime} onChange={e => setResTime(e.target.value)} />
                  </div>
              </div>
              <label>Duration: {resDuration} min</label>
            <input type="range" className="form-range" min="15" max="60" step="15" 
                     value={resDuration} onChange={e => setResDuration(e.target.value)} />
              
              <div className="alert alert-info py-2 text-dark">
                  <div>From: <strong>{formatTime(startDateTime)}</strong> &nbsp; To: <strong>{formatTime(endDateTime)}</strong></div>
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

      {/* Payment State */}
      {state === 'payment' && (
          <div>
              <h5>💳 Payment Method</h5>
              
              {savedCard && (
                  <div className="form-check mb-2">
                      <input className="form-check-input" type="radio" checked={payMethod === 'saved'} onChange={() => setPayMethod('saved')} />
                      <label className="form-check-label">Saved Card (•••• {savedCard.number.slice(-4)})</label>
                  </div>
              )}
              
              <div className="form-check mb-3">
                  <input className="form-check-input" type="radio" checked={payMethod === 'new'} onChange={() => setPayMethod('new')} />
                  <label className="form-check-label">New Card</label>
              </div>

              {payMethod === 'new' && (
                  <div className="card p-2 mb-3">
                      <input type="text" className="form-control mb-2" placeholder="Card Number" 
                             onChange={e => setCardDetails({...cardDetails, number: e.target.value})} />
                      <div className="row g-2">
                          <div className="col-6">
                              <input type="text" className="form-control" placeholder="MM/YY"
                                     onChange={e => setCardDetails({...cardDetails, exp: e.target.value})} />
                          </div>
                          <div className="col-6">
                              <input type="password" className="form-control" placeholder="CVV"
                                     onChange={e => setCardDetails({...cardDetails, cvv: e.target.value})} />
                          </div>
                      </div>
                      <div className="form-check mt-2">
                          <input className="form-check-input" type="checkbox" onChange={e => setSaveCheck(e.target.checked)} />
                          <label className="form-check-label small">Save card for future</label>
                      </div>
                  </div>
              )}

              <div className="d-grid gap-2">
                  <button className="btn btn-primary" onClick={handleStartCharging}>Pay & Start</button>
                  <button className="btn btn-secondary" onClick={() => setState('idle')}>Cancel</button>
              </div>
          </div>
      )}

      {/* Charging State */}
      {state === 'charging' && (
          <div className="text-center">
              <h4 className="text-warning">🔌 Charging...</h4>
              <div className="progress mb-3" style={{height: '25px'}}>
                  <div className="progress-bar progress-bar-striped progress-bar-animated bg-success" 
                       style={{width: `${progress}%`}}>{progress}%</div>
              </div>
              <div className="row text-center">
                  <div className="col-6">
                      <h2>{sessionMetrics.kwh}</h2>
                      <small>kWh</small>
                  </div>
                  <div className="col-6">
                      <h2>{sessionMetrics.cost} €</h2>
                      <small>Cost</small>
                  </div>
              </div>
          </div>
      )}

      {/* Summary State */}
      {state === 'summary' && (
          <div className="text-center">
              <h4 className="text-success">✅ Charging Complete!</h4>
              <div className="card p-3 my-3">
                  <h5>Receipt</h5>
                  <hr />
                  <div className="d-flex justify-content-between">
                      <span>Total Energy:</span>
                      <strong>{sessionMetrics.kwh} kWh</strong>
                  </div>
                  <div className="d-flex justify-content-between">
                      <span>Total Cost:</span>
                      <strong>{sessionMetrics.cost} €</strong>
                  </div>
              </div>
              <button className="btn btn-primary w-100" onClick={handleFinishSession}>Finish & Save</button>
          </div>
      )}

    </div>
  );
};

export default InfoPanel;