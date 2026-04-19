import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TOTAL_KM = 5089;

// 🔵 EDIT THESE FOR BRANDING
const SCHOOL_NAME = "President Brand Primêr";
const SPONSOR_NAME = "GoodBurger";
const SPONSOR_LOGO = "https://goodburger.co.za"; // replace with real logo URL

const checkpoints = [
  { name: "Bloemfontein", km: 0, coords: [-29.1129, 26.2149] },
  { name: "Sannieshof", km: 340, coords: [-26.5333, 25.8] },
  { name: "Upington", km: 866, coords: [-28.4508, 21.2468] },
  { name: "Springbok", km: 1243, coords: [-29.6641, 17.8865] },
  { name: "Cape Town", km: 1807, coords: [-33.9221, 18.4231] },
  { name: "Mossel Bay", km: 2194, coords: [-34.1833, 22.1333] },
  { name: "Port Alfred", km: 2742, coords: [-33.587, 26.906] },
  { name: "Durban", km: 3528, coords: [-29.8527, 31.0298] },
  { name: "Kruger National Park", km: 4270, coords: [-23.9884, 31.5547] },
  { name: "Johannesburg", km: 4685, coords: [-26.2044, 28.0456] },
  { name: "Finish", km: 5089, coords: [-29.1129, 26.2149] }
];

const defaultClasses = [
  { name: "SO", words: 0 },
  { name: "4RL", words: 0 },
  { name: "4MS", words: 0 },
  { name: "5MP", words: 0 },
  { name: "5GK", words: 0 },
  { name: "5SZ", words: 0 },
  { name: "6FH", words: 0 },
  { name: "6CS", words: 0 },
  { name: "6RV", words: 0 },
  { name: "7SN", words: 0 },
  { name: "7RH", words: 0 },
  { name: "7IP", words: 0 }
];

const colors = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8",
  "#f58231", "#911eb4", "#46f0f0", "#f032e6",
  "#bcf60c", "#fabebe", "#008080", "#e6beff"
];

export default function App() {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);

  const isMapOnly = typeof window !== "undefined" && window.location.search.includes("map=1");

  const getSnapshotFromURL = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const data = params.get("data");
      if (!data) return null;
      return JSON.parse(atob(data));
    } catch {
      return null;
    }
  };

  const snapshot = isMapOnly ? getSnapshotFromURL() : null;

  const [classes, setClasses] = useState(snapshot || defaultClasses);
  const [routeCoords, setRouteCoords] = useState([]);

  useEffect(() => {
    if (snapshot) return;
    const saved = localStorage.getItem("raceData");
    if (saved) setClasses(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (snapshot) return;
    localStorage.setItem("raceData", JSON.stringify(classes));
  }, [classes]);

  const updateWords = (index, value) => {
    const updated = [...classes];
    updated[index].words = Number(value);
    setClasses(updated);
  };

  const getTotalKm = (words) => words * 1;
  const getLap = (km) => Math.floor(km / TOTAL_KM);
  const getKmInLap = (km) => km % TOTAL_KM;

  useEffect(() => {
    const fetchRoute = async () => {
      try {
        const coordsStr = checkpoints
          .map(c => `${c.coords[1]},${c.coords[0]}`)
          .join(";");

        const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
        const res = await fetch(url);

        if (!res.ok) throw new Error("OSRM failed");

        const data = await res.json();
        const coords = data?.routes?.[0]?.geometry?.coordinates;

        if (!coords) throw new Error("No route data");

        setRouteCoords(coords.map(([lng, lat]) => [lat, lng]));
      } catch (e) {
        console.error("Route fetch failed", e);
        setRouteCoords(checkpoints.map(c => c.coords));
      }
    };

    fetchRoute();
  }, []);

  const interpolateIndex = (km) => {
    const fraction = Math.min(Math.max(km / TOTAL_KM, 0), 1);
    return Math.floor(fraction * (routeCoords.length - 1));
  };

  const getPathCoords = (totalKm) => {
    if (!routeCoords.length) return [];

    const laps = getLap(totalKm);
    const kmInLap = getKmInLap(totalKm);
    const idx = interpolateIndex(kmInLap);

    let path = [];
    for (let i = 0; i < laps; i++) path = path.concat(routeCoords);
    path = path.concat(routeCoords.slice(0, idx + 1));

    return path;
  };

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current).setView([-30, 25], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
      }).addTo(leafletMap.current);
    }

    leafletMap.current.eachLayer(layer => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker) {
        leafletMap.current.removeLayer(layer);
      }
    });

    if (routeCoords.length) {
      L.polyline(routeCoords, { opacity: 0.3 }).addTo(leafletMap.current);
    }

    const leaderKm = Math.max(...classes.map(c => getTotalKm(c.words)));
    // 🧠 light overlap handling
    const positionMap = {};

    classes.forEach((c, i) => {
      const totalKm = getTotalKm(c.words);
      const lap = getLap(totalKm);
      const kmInLap = getKmInLap(totalKm);
      const idx = interpolateIndex(kmInLap);
      let basePos = routeCoords[idx] || checkpoints[0].coords;
      const key = basePos.join(",");
      const count = positionMap[key] || 0;
      positionMap[key] = count + 1;

      // small circular spread for overlapping classes
      const angle = count * (Math.PI / 4);
      const offset = 0.01;

      const pos = [
        basePos[0] + Math.cos(angle) * offset,
        basePos[1] + Math.sin(angle) * offset
      ];
      const isLeader = totalKm === leaderKm && leaderKm > 0;
      const color = colors[i % colors.length];

      const path = getPathCoords(totalKm);
      if (path.length > 1) {
        L.polyline(path, {
          color,
          weight: isLeader ? 5 : 3,
          opacity: isLeader ? 0.9 : 0.6
        }).addTo(leafletMap.current);
      }

      const icon = L.divIcon({
        html: `<div style="
          width:18px;
          height:18px;
          border-radius:50%;
          background:${color};
          border:2px solid ${isLeader ? 'gold' : color};
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:9px;
          font-weight:bold;
          color:black;
        ">${c.name}</div>`,
        className: "",
        iconSize: [22, 22]
      });

      L.marker(pos, { icon })
        .addTo(leafletMap.current)
        .bindPopup(`${c.name} • Lap ${lap} • ${kmInLap.toFixed(0)} km`);
    });
  }, [classes, routeCoords]);

  const copyMapLink = async () => {
    const encoded = btoa(JSON.stringify(classes));
    const url = `${window.location.origin}?map=1&data=${encoded}`;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        alert("Static map link copied 👍");
      } else {
        throw new Error();
      }
    } catch {
      prompt("Copy this link:", url);
    }
  };

  return (
    <div style={{ padding: isMapOnly ? 0 : 20, position: "relative" }}>

      {!isMapOnly && (
        <button onClick={copyMapLink}>📤 Share Static Map</button>
      )}

      {!isMapOnly && classes.map((c,i)=>(
        <div key={i}>
          {c.name} <input type="number" value={c.words} onChange={e=>updateWords(i,e.target.value)} />
        </div>
      ))}

      {/* 🏫 BRANDING OVERLAY (MAP ONLY) */}
      {isMapOnly && (
        <div style={{
          position: "absolute",
          top: 10,
          left: 10,
          right: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(255,255,255,0.85)",
          padding: "8px 12px",
          borderRadius: 10,
          zIndex: 1000
        }}>
          <div style={{ fontWeight: "bold", fontSize: 16 }}>
            {SCHOOL_NAME}
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12 }}>Sponsored by</div>
            {SPONSOR_LOGO && SPONSOR_LOGO !== "empty" ? (
              <img src={SPONSOR_LOGO} alt="sponsor" style={{ height: 30 }} />
            ) : (
              <div style={{ fontSize: 12, fontWeight: "bold" }}>
                {SPONSOR_NAME}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ height: isMapOnly ? "100vh" : 500 }} ref={mapRef}></div>
    </div>
  );
}
