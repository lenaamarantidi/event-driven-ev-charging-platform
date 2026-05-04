import { useState } from 'react';

const Sidebar = ({ setFilters, onLogout, onFiltersApplied }) => { 
  
  // Τοπική κατάσταση για τη φόρμα 
  const [localFilters, setLocalFilters] = useState({
    costMin: 0.0,
    costMax: 2.0,
    dist: 100,
    powerMin: 0,
    powerMax: 350,
    avail: [],
    type: [],
    connectorTypes: []
  });

  const handleCheckboxChange = (e, category) => {
    const { value, checked } = e.target;
    setLocalFilters(prev => {
      const list = prev[category];
      if (checked) return { ...prev, [category]: [...list, value] };
      return { ...prev, [category]: list.filter(item => item !== value) };
    });
  };

  // Όταν πατηθεί το κουμπί, στέλνουμε τα δεδομένα στο Home
  const handleApply = (e) => {
    e.preventDefault();
    setFilters({ ...localFilters });
    // Close info panel when filters are applied
    if (onFiltersApplied) {
      onFiltersApplied();
    }
  };

  return (
    <div className="border-end p-3 d-flex flex-column gap-3" 
         style={{ width: '300px', minWidth: '300px', height: '100%', overflowY: 'auto', backgroundColor: '#2d1f47', color: '#f5f1ff' }}>
      
      {/* 1. Logout Button */}
      <button className="btn btn-outline-light w-100" onClick={onLogout}>
        🚪 Logout
      </button>
      
      <hr className="text-secondary my-1" />
      
      <h4 className="mb-0" style={{ color: '#f5f1ff' }}>Filter Options</h4>

      {/* 2. Η Φόρμα */}
      <form onSubmit={handleApply}>
        
        {/* Type (AC/DC) */}
        <div className="mb-3">
          <label className="fw-bold d-block mb-1">Charger Type (AC/DC)</label>
          <div className="card p-2 bg-secondary bg-opacity-25">
            {['AC', 'DC'].map(type => (
              <div className="form-check" key={type}>
                <input 
                  className="form-check-input" 
                  type="checkbox" 
                  value={type} 
                  checked={localFilters.type.includes(type)}
                  onChange={(e) => handleCheckboxChange(e, 'type')} 
                />
                <label className="form-check-label">{type}</label>
              </div>
            ))}
          </div>
        </div>

        {/* Connector Types */}
        <div className="mb-3">
          <label className="fw-bold d-block mb-1">Connector Types</label>
          <div className="card p-2 bg-secondary bg-opacity-25">
            {['Type 2', 'CCS1', 'CCS2', 'CHAdeMO', 'Wall (Euro)', 'J-1772', 'Type 3', 'Type 3A', 'Caravan Mains Socket', 'Three Phase EU', 'Other'].map(connector => (
              <div className="form-check" key={connector}>
                <input 
                  className="form-check-input" 
                  type="checkbox" 
                  value={connector} 
                  checked={localFilters.connectorTypes.includes(connector)}
                  onChange={(e) => handleCheckboxChange(e, 'connectorTypes')} 
                />
                <label className="form-check-label">{connector}</label>
              </div>
            ))}
          </div>
        </div>

        {/* Cost Range */}
        <div className="mb-3">
          <label className="form-label fw-bold">
            Cost (€/kWh): {localFilters.costMin.toFixed(2)} - {localFilters.costMax.toFixed(2)}
          </label>
          <input 
            type="range" className="form-range" min="0" max="2" step="0.05" 
            value={localFilters.costMin} 
            onChange={e => {
              const newMin = parseFloat(e.target.value);
              setLocalFilters(prev => ({
                ...prev,
                costMin: newMin,
                costMax: Math.max(prev.costMax, newMin)
              }));
            }} 
          />
          <input 
            type="range" className="form-range" min="0" max="2" step="0.05" 
            value={localFilters.costMax} 
            onChange={e => {
              const newMax = parseFloat(e.target.value);
              setLocalFilters(prev => ({
                ...prev,
                costMax: newMax,
                costMin: Math.min(prev.costMin, newMax)
              }));
            }} 
          />
        </div>

        {/* Availability */}
        <div className="mb-3">
          <label className="fw-bold d-block mb-1">Availability</label>
          <div className="card p-2 bg-secondary bg-opacity-25">
            {[
              { value: 'available', label: 'Available', color: '#4CAF50' },
              { value: 'occupied', label: 'Occupied', color: '#F44336' },
              { value: 'unavailable', label: 'Unavailable', color: '#9E9E9E' },
              { value: 'booked_by_me', label: 'Booked by me', color: '#9C27B0' }
            ].map(({ value, label, color }) => (
              <div className="form-check d-flex align-items-center" key={value}>
                <input 
                  className="form-check-input" 
                  type="checkbox" 
                  value={value} 
                  checked={localFilters.avail.includes(value)}
                  onChange={(e) => handleCheckboxChange(e, 'avail')} 
                />
                <label className="form-check-label d-flex align-items-center">
                  <span 
                    style={{
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: color,
                      marginRight: '6px',
                      border: '1px solid rgba(255,255,255,0.3)'
                    }}
                  ></span>
                  {label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Capacity Range */}
        <div className="mb-3">
          <label className="form-label fw-bold">
            Capacity (kW): {localFilters.powerMin} - {localFilters.powerMax}
          </label>
          <input 
            type="range" className="form-range" min="0" max="350" step="5" 
            value={localFilters.powerMin} 
            onChange={e => {
              const newMin = parseInt(e.target.value);
              setLocalFilters(prev => ({
                ...prev,
                powerMin: newMin,
                powerMax: Math.max(prev.powerMax, newMin)
              }));
            }} 
          />
          <input 
            type="range" className="form-range" min="0" max="350" step="5" 
            value={localFilters.powerMax} 
            onChange={e => {
              const newMax = parseInt(e.target.value);
              setLocalFilters(prev => ({
                ...prev,
                powerMax: newMax,
                powerMin: Math.min(prev.powerMin, newMax)
              }));
            }} 
          />
        </div>

        {/* Distance Slider */}
        <div className="mb-3">
          <label className="form-label fw-bold">Distance (km): {localFilters.dist >= 100 ? '100+' : localFilters.dist}</label>
          <input 
            type="range" className="form-range" min="0" max="100" step="5" 
            value={localFilters.dist} 
            onChange={e => setLocalFilters({...localFilters, dist: parseInt(e.target.value)})} 
          />
        </div>

        {/* 3. Apply Button (Form Submit) */}
        <button type="submit" className="btn btn-secondary w-100">
          🔎 Apply Filters
        </button>

      </form>
    </div>
  );
};

export default Sidebar;