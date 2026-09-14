import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from './ui.jsx';

// Centro do município de Abaetetuba, Pará, Brasil
const ABAETETUBA_CENTER = [-1.7218, -48.8788];
const DEFAULT_ZOOM = 11;

const ZONE_STYLE = {
  SEDE: { color: '#2563eb', label: 'Sede' },
  ESTRADAS: { color: '#f59e0b', label: 'Estradas' },
  ILHAS: { color: '#10b981', label: 'Ilhas' },
  URBANA: { color: '#8b5cf6', label: 'Urbana' },
  RURAL: { color: '#0d9488', label: 'Rural' },
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
  box.style.maxWidth = '320px';
  box.style.whiteSpace = 'normal';
  box.style.lineHeight = '1.35';

  const title = document.createElement('div');
  title.textContent = school.name;
  title.style.fontWeight = '800';
  title.style.fontSize = '13.5px';
  title.style.marginBottom = '5px';
  title.style.color = 'inherit';
  box.appendChild(title);

  addLine(box, 'Município', 'Abaetetuba - PA');
  addLine(box, 'INEP', school.inep || '—');
  addLine(box, 'Endereço', school.address || '—');
  addLine(box, 'Gestor(a)', school.responsible || '—');
  addLine(box, 'Zona', ZONE_STYLE[school.zone]?.label || school.zone || '—');
  if (school.latitude && school.longitude) {
    addLine(box, 'Coordenadas', `${Number(school.latitude).toFixed(4)}, ${Number(school.longitude).toFixed(4)}`);
  }
  return box;
}

export default function SchoolMap({ schools = [], hideHeader = false, height = 460 }) {
  const rootRef = useRef(null);
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const expandedRef = useRef(false);
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

  const close = () => {
    setExpanded(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return undefined;

    // Inicialização do Mapa focado no território de Abaetetuba, Pará, Brasil
    const map = L.map(mapElementRef.current, {
      center: ABAETETUBA_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    // Camada ESRI World Street Map (100% gratuita, sem marca d'água, sem chave de API e sem bloqueios 403)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: '&copy; Esri &mdash; Abaetetuba, PA',
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
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
      const style = ZONE_STYLE[school.zone] || { color: '#2563eb' };
      L.circleMarker([latitude, longitude], {
        radius: 7.5,
        color: '#ffffff',
        weight: 2.2,
        fillColor: style.color,
        fillOpacity: 0.95,
      })
        .bindTooltip(schoolTooltip(school), {
          direction: 'top',
          sticky: true,
          opacity: 0.98,
          offset: [0, -8],
        })
        .addTo(layer);
    }

    if (coordinates.length > 0) {
      // Ajusta o enquadramento preservando o foco em Abaetetuba
      map.fitBounds(coordinates, { padding: [35, 35], maxZoom: 13 });
    } else {
      map.setView(ABAETETUBA_CENTER, DEFAULT_ZOOM);
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
    <div
      ref={rootRef}
      className={hideHeader ? 'map-container-clean' : 'card'}
      style={expanded ? {
        position: 'fixed', inset: 0, zIndex: 10000, borderRadius: 0,
        padding: 16, background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      } : { position: 'relative', overflow: 'hidden', width: '100%', borderRadius: 14 }}
    >
      {!hideHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: expanded ? '0 0 12px' : '14px 16px 10px' }}>
          <div style={{ flex: 1 }}>
            <div className="card-title">Localização das escolas — Abaetetuba/PA</div>
            <div className="card-subtitle">
              {schools.length} escola(s) no município de Abaetetuba · passe o mouse sobre um ponto
            </div>
          </div>
          <Button variant="secondary" onClick={expanded ? close : expand}>
            {expanded ? '✕ Fechar apresentação' : '⛶ Expandir mapa'}
          </Button>
        </div>
      )}

      <div style={{ position: 'relative', flex: expanded ? 1 : undefined, minHeight: 0, width: '100%' }}>
        <div
          ref={mapElementRef}
          role="application"
          aria-label="Mapa de Abaetetuba com a localização das escolas"
          style={{
            width: '100%',
            height: expanded ? '100%' : height,
            minHeight: expanded ? 400 : height,
            cursor: 'grab',
            borderRadius: 12,
            zIndex: 1,
          }}
        />

        {/* Botão de Expandir Mapa Sobreposto se hideHeader=true */}
        {hideHeader && (
          <button
            type="button"
            className="map-floating-expand-btn"
            onClick={expanded ? close : expand}
            title={expanded ? 'Fechar tela inteira' : 'Expandir mapa'}
          >
            {expanded ? '✕ Fechar' : '⛶ Expandir mapa'}
          </button>
        )}

        {/* Legenda Flutuante de Zonas */}
        <div
          className="map-floating-legend"
          style={{
            position: 'absolute', left: 12, bottom: 18, zIndex: 500,
            display: 'flex', flexWrap: 'wrap', gap: 10, padding: '7px 12px',
            borderRadius: 8, fontSize: 11.5, fontWeight: 600, pointerEvents: 'none',
          }}
        >
          {Object.entries(ZONE_STYLE).slice(0, 3).map(([key, style]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: style.color }} />
              {style.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
