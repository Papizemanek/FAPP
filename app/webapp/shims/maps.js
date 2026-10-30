// Webová verze: mapa během schůzky přes Leaflet ze serveru (/vendor/leaflet, povolené v CSP)
// a mapové podklady OpenStreetMap. Ukazuje vlastní polohu z prohlížeče a sleduje ji.
const React = require('react');
const { View } = require('react-native');

let leaflet = null;
function loadLeaflet() {
  if (leaflet) return leaflet;
  leaflet = new Promise((resolve, reject) => {
    if (globalThis.L) return resolve(globalThis.L);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const script = document.createElement('script');
    script.src = '/vendor/leaflet/leaflet.js';
    script.onload = () => resolve(globalThis.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leaflet;
}

function MapView(props) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    let map = null;
    let marker = null;
    let watch = null;
    let cancelled = false;
    const region = props.initialRegion ?? { latitude: 50.08, longitude: 14.43 };
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current) return;
        map = L.map(ref.current, { zoomControl: false, attributionControl: true }).setView([region.latitude, region.longitude], 15);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        const geo = globalThis.navigator?.geolocation;
        if (geo && props.showsUserLocation) {
          watch = geo.watchPosition(
            (p) => {
              const at = [p.coords.latitude, p.coords.longitude];
              if (!marker) {
                marker = L.circleMarker(at, { radius: 9, color: '#121014', weight: 3, fillColor: '#62E0B5', fillOpacity: 1 }).addTo(map);
              } else marker.setLatLng(at);
              if (props.followsUserLocation) map.setView(at, map.getZoom());
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 15000 },
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watch != null) globalThis.navigator?.geolocation?.clearWatch(watch);
      if (map) map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return React.createElement(View, { ref, style: [props.style, { backgroundColor: '#1E1B22', overflow: 'hidden' }] });
}

module.exports = MapView;
module.exports.default = MapView;
