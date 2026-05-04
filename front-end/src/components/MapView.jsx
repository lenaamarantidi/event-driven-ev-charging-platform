import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';

// 1. Custom Icons
// Colors based on location outlet status:
// - Green: At least one available outlet
// - Violet/Purple: At least one outlet booked by me (takes priority)
// - Red: At least one occupied outlet (charging/reserved by others) and none available/booked by me
// - Gray: All outlets are offline/malfunction
const getIcon = (color) => {
  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};

const greenIcon = getIcon('green');   // At least one available
const redIcon = getIcon('red');       // Occupied (charging/reserved by others)
const grayIcon = getIcon('grey');     // All offline/malfunction
const blueIcon = getIcon('blue');     // User location
const occupiedIcon = getIcon('blue'); // Occupied (charging/reserved by others)
const violetIcon = getIcon('violet'); // Booked by me
const orangeIcon = getIcon('orange'); // Selected

// 2. Map Updater Component για κίνηση στο κέντρο
const MapUpdater = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 14, { duration: 1.5 }); // Smooth animation
  }, [center, map]);
  return null;
};

const ChargerCluster = ({ chargers, onSelectCharger, selectedCharger }) => {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup();

    chargers.forEach((charger) => {
      // Check if selected first (selected always shows as orange)
      if (selectedCharger && selectedCharger.pointid === charger.pointid) {
        const marker = L.marker([charger.lat, charger.lon], { icon: orangeIcon });
        marker.on('click', () => onSelectCharger(charger));
        clusterGroup.addLayer(marker);
        return;
      }

      // Determine color based on outlets array
      let icon = redIcon; // Default: out of service

      const outlets = Array.isArray(charger.outlets) ? charger.outlets : [];
      const hasBookedByMe = outlets.some(o => o.status === 'booked_by_me');
      const hasAvailable = outlets.some(o => o.status === 'available');
      const hasOccupied = outlets.some(o => o.status === 'charging' || o.status === 'reserved');

      if (hasBookedByMe) {
        icon = violetIcon; // Purple (booked by me takes priority)
      } else if (hasAvailable) {
        icon = greenIcon; // Green (at least one available)
      } else if (hasOccupied) {
        icon = redIcon; // Red (occupied by others)
      } else {
        icon = grayIcon; // Gray (all offline/malfunction or no data)
      }

      const marker = L.marker([charger.lat, charger.lon], { icon });
      marker.on('click', () => onSelectCharger(charger));
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      map.removeLayer(clusterGroup);
      clusterGroup.clearLayers();
    };
  }, [map, chargers, selectedCharger, onSelectCharger]);

  return null;
};

const MapView = ({ chargers, onSelectCharger, userLocation, selectedCharger }) => {
  return (
    <MapContainer center={userLocation} zoom={14} style={{ height: "100%", width: "100%" }}>
      
      {/* Ενεργοποιεί την αυτόματη μετακίνηση */}
      <MapUpdater center={userLocation} />

      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      
      {/* User Marker (Μπλε) */}
      <Marker position={userLocation} icon={blueIcon}>
        <Popup>You are here 🏠</Popup>
      </Marker>

      {/* Charger Markers (Clustered) */}
      <ChargerCluster
        chargers={chargers}
        onSelectCharger={onSelectCharger}
        selectedCharger={selectedCharger}
      />
    </MapContainer>
  );
};

export default MapView;