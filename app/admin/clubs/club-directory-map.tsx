"use client";

import { useEffect, useMemo, useRef } from "react";

type LeafletApi = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => void };
  marker: (coordinates: [number, number]) => LeafletMarker;
  latLngBounds: (coordinates: Array<[number, number]>) => LeafletBounds;
};

type LeafletMap = {
  remove: () => void;
  fitBounds: (bounds: LeafletBounds, options?: Record<string, unknown>) => void;
  setView: (coordinates: [number, number], zoom: number) => void;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
};

type LeafletBounds = unknown;

declare global {
  interface Window {
    L?: LeafletApi;
    __squashLeafletLoading?: Promise<LeafletApi>;
  }
}

type ClubMapItem = {
  id: string;
  name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (window.__squashLeafletLoading) return window.__squashLeafletLoading;

  window.__squashLeafletLoading = new Promise((resolve, reject) => {
    if (!document.querySelector("link[data-leaflet-css]")) {
      const link = document.createElement("link");
      link.dataset.leafletCss = "true";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => window.L ? resolve(window.L) : reject(new Error("Leaflet no se ha cargado."));
    script.onerror = () => reject(new Error("No se ha podido cargar Leaflet."));
    document.head.appendChild(script);
  });

  return window.__squashLeafletLoading;
}

export function ClubDirectoryMap({ clubs }: { clubs: ClubMapItem[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const geocodedClubs = useMemo(() => clubs.filter((club) =>
    typeof club.latitude === "number" &&
    Number.isFinite(club.latitude) &&
    typeof club.longitude === "number" &&
    Number.isFinite(club.longitude)
  ), [clubs]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !geocodedClubs.length) return;

    let map: LeafletMap | null = null;
    let isMounted = true;

    loadLeaflet().then((leaflet) => {
      if (!isMounted) return;

      const coordinates = geocodedClubs.map((club) => [club.latitude!, club.longitude!] as [number, number]);
      map = leaflet.map(container, { scrollWheelZoom: false });
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
      }).addTo(map);

      for (const club of geocodedClubs) {
        const label = `<strong>${escapeHtml(club.name)}</strong>${club.city ? `<br>${escapeHtml(club.city)}` : ""}`;
        leaflet.marker([club.latitude!, club.longitude!]).addTo(map).bindPopup(label);
      }

      if (coordinates.length === 1) {
        map.setView(coordinates[0], 13);
      } else {
        map.fitBounds(leaflet.latLngBounds(coordinates), { padding: [28, 28], maxZoom: 13 });
      }
    }).catch(() => {
      container.classList.add("is-unavailable");
    });

    return () => {
      isMounted = false;
      map?.remove();
    };
  }, [geocodedClubs]);

  if (!geocodedClubs.length) return null;

  return (
    <div className="club-directory-map">
      <div className="club-directory-map-canvas" ref={containerRef} />
    </div>
  );
}
