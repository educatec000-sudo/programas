import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from './ui.jsx';

const DEFAULT_CENTER = [-1.7218, -48.8788];
const ZONE_STYLE = {
  SEDE: { color: '#1d4ed8', label: 'Sede' },
  ESTRADAS: { color: '#d97706', label: 'Estradas' },
  ILHAS: { color: '#15803d', label: 'Ilhas' },
  URBANA: { color: '#7c3aed', label: 'Urbana' },
  RURAL: { color: '#0f766e', label: 'Rural' },
};

function addLine(container, label, value) {
  if (value === null || value === undefined || value === '') return;
  const line = document.createElement('div');
  line.style.marginTop = '3px';
  line.style.fontSize = '12px';
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  const text = document.createElement('span');
  text.textContent = String(value);
  line.append(strong, text);
  container.appendChild(line);
}

function schoolTooltip(school) {
  const box = document.createElement('div');
  box.style.minWidth = '220px';
  box.style.maxWidth = '340px';
  box.style.whiteSpace = 'normal';
  box.style.lineHeight = '1.35';

  const title = document.createElement('div');
  title.textContent = school.name;
  title.style.fontWeight = '800';
  title.style.fontSize = '13px';
  title.style.marginBottom = '5px';
  title.style.color = '#0f172a';
  box.appendChild(title);

  addLine(box, 'INEP', school.inep || '—');
  addLine(box, 'Endereço', school.address || '—');
  addLine(box, 'Gestor(a)', school.responsible || '—');
  addLine(box, 'Zona', ZONE_STYLE[school.zone]?.label || school.zone || '—');
  addLine(box, 'Latitude', school.latitude);
  addLine(box, 'Longitude', school.longitude);
  return box;
}

export default function SchoolMap({ schools = [] }) {
  const rootRef = useRef(null);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const expandedRef = useRef(false);
  const expandActionRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  expandedRef.current = expanded;

  const expand = () => {
    if (expandedRef.current) return;
    const root = rootRef.current;
    if (root?.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen().catch(() => {});
    }
    setExpanded(true);
  };
  expandActionRef.current = expand;

  const close = () => {
    setExpanded(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return undefined;

    const map = L.map(mapElementRef.current, {
      center: DEFAULT_CENTER,
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    map.on('click', () => {
      if (!expandedRef.current) expandActionRef.current?.();
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const coordinates = [];
    for (const school of schools) {
      const latitude = Number(school.latitude);
      const longitude = Number(school.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      coordinates.push([latitude, longitude]);
      const style = ZONE_STYLE[school.zone] || { color: '#334155' };
      L.circleMarker([latitude, longitude], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: style.color,
        fillOpacity: 0.92,
      })
        .bindTooltip(schoolTooltip(school), {
          direction: 'top',
          sticky: true,
          opacity: 0.98,
          offset: [0, -7],
        })
        .addTo(layer);
    }

    if (coordinates.length) {
      map.fitBounds(coordinates, { padding: [35, 35], maxZoom: 13 });
    } else {
      map.setView(DEFAULT_CENTER, 10);
    }
  }, [schools]);

  useEffect(() => {
    const map = mapRef.current;
    const timer = setTimeout(() => map?.invalidateSize({ animate: false }), 80);
    document.body.style.overflow = expanded ? 'hidden' : '';
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = '';
    };
  }, [expanded]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && expandedRef.current) setExpanded(false);
      setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 60);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && expandedRef.current && !document.fullscreenElement) close();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <section
      ref={rootRef}
      className="card"
      style={expanded ? {
        position: 'fixed', inset: 0, zIndex: 10000, borderRadius: 0,
        padding: 16, background: '#f8fafc', display: 'flex', flexDirection: 'column',
      } : { marginBottom: 16, overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: expanded ? '0 0 12px' : '14px 16px 10px' }}>
        <div style={{ flex: 1 }}>
          <div className="card-title">Localização das escolas</div>
          <div className="card-subtitle">
            {schools.length} escola(s) com coordenadas · passe o mouse sobre um ponto para ver os dados
          </div>
        </div>
        <Button variant="secondary" onClick={expanded ? close : expand}>
          {expanded ? '✕ Fechar apresentação' : '⛶ Expandir mapa'}
        </Button>
      </div>

      <div style={{ position: 'relative', flex: expanded ? 1 : undefined, minHeight: 0 }}>
        <div
          ref={mapElementRef}
          role="application"
          aria-label="Mapa com a localização das escolas"
          title={expanded ? 'Passe o mouse nos pontos para ver as escolas' : 'Clique no mapa para abrir em tela inteira'}
          style={{
            width: '100%',
            height: expanded ? '100%' : 430,
            minHeight: expanded ? 400 : 430,
            cursor: expanded ? 'grab' : 'zoom-in',
            borderRadius: expanded ? 10 : 0,
            zIndex: 1,
          }}
        />

        <div style={{
          position: 'absolute', left: 12, bottom: 28, zIndex: 500,
          display: 'flex', flexWrap: 'wrap', gap: 8, padding: '7px 10px',
          background: 'rgba(255,255,255,.94)', borderRadius: 8,
          boxShadow: '0 2px 10px rgba(15,23,42,.18)', fontSize: 11.5,
          pointerEvents: 'none',
        }}>
          {Object.entries(ZONE_STYLE).slice(0, 3).map(([key, style]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: style.color }} />
              {style.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
