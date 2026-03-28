"use client";

/**
 * EmployeeMap — Leaflet map with MarkerClusterGroup support.
 *
 * Imported dynamically with `ssr: false` from the parent page because Leaflet
 * accesses `window` at module initialisation time and will crash Next.js SSR.
 *
 * Marker colour scheme:
 *   ACTIVE   → green  (checked in within the last 2 hours)
 *   RECENT   → orange (checked out, still this calendar day)
 *   INACTIVE → grey   (no session activity today)
 *
 * Selected employee → enlarged SVG + pulsing ring overlay.
 * Clustering        → nearby markers grouped at low zoom via MarkerClusterGroup.
 */

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import type { EmployeeMapMarker } from "@/types";

// ─── Marker icon colours ──────────────────────────────────────────────────────

const STATUS_COLOURS: Record<EmployeeMapMarker["status"], string> = {
  ACTIVE:   "#22c55e",  // green-500
  RECENT:   "#f97316",  // orange-500
  INACTIVE: "#94a3b8",  // slate-400
};

function makeIcon(
  status: EmployeeMapMarker["status"],
  selected = false
) {
  const colour = STATUS_COLOURS[status];
  const size   = selected ? 32 : 24;
  const inner  = selected ? 8  : 5;

  const pulse = selected
    ? `<circle cx="16" cy="16" r="14" fill="${colour}" opacity="0.25">
         <animate attributeName="r" values="14;18;14" dur="1.6s" repeatCount="indefinite"/>
         <animate attributeName="opacity" values="0.25;0;0.25" dur="1.6s" repeatCount="indefinite"/>
       </circle>`
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${pulse}
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${colour}" opacity="${selected ? 1 : 0.9}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${inner}" fill="#fff" opacity="0.8"/>
    </svg>
  `.trim();

  return L.divIcon({
    html: svg,
    className: "",       // prevent Leaflet's default white-box class
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 2)],
  });
}

// ─── Popup HTML ───────────────────────────────────────────────────────────────

function buildPopupHtml(m: EmployeeMapMarker): string {
  const ts   = new Date(m.recordedAt).toLocaleString();
  const code = m.employeeCode ? ` (${m.employeeCode})` : "";
  const statusColour =
    m.status === "ACTIVE" ? "#22c55e" :
    m.status === "RECENT" ? "#f97316" : "#94a3b8";

  return `
    <div style="min-width:170px;font-family:sans-serif;font-size:13px;line-height:1.5">
      <strong style="font-size:14px">${m.employeeName}${code}</strong><br/>
      <span style="color:${statusColour};font-weight:700;text-transform:uppercase;font-size:11px">${m.status}</span><br/>
      <span style="color:#888;font-size:11px">Last fix: ${ts}</span>
    </div>
  `.trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  markers:            EmployeeMapMarker[];
  isLoading:          boolean;
  selectedEmployeeId?: string | null;
}

export default function EmployeeMap({ markers, isLoading, selectedEmployeeId }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<LeafletMap | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  // Track current markers by employeeId → Leaflet marker
  const markerMapRef    = useRef<Map<string, LeafletMarker>>(new Map());

  // ── Initialise Leaflet map once ────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const container = mapContainerRef.current;

    const map = L.map(container, {
      center: [20, 0],
      zoom:   2,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Marker cluster group with custom cluster icon
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 60,
      showCoverageOnHover: false,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div style="
            width:36px;height:36px;border-radius:50%;
            background:rgba(99,102,241,0.85);
            border:2px solid rgba(99,102,241,0.4);
            color:#fff;font-weight:700;font-size:13px;
            display:flex;align-items:center;justify-content:center;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
          ">${count}</div>`,
          className: "",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
      },
    });
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;
    mapRef.current = map;

    // ResizeObserver → invalidateSize when container dimensions change
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(container);

    const raf = requestAnimationFrame(() => map.invalidateSize({ animate: false }));

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current     = null;
      clusterGroupRef.current = null;
      markerMapRef.current.clear();
    };
  }, []);

  // ── Sync markers when data or selection changes ────────────────────────────
  useEffect(() => {
    const map          = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map || !clusterGroup) return;

    const incoming = new Map(markers.map((m) => [m.employeeId, m]));
    const existing = markerMapRef.current;

    // Remove markers no longer in the data set
    for (const [id, leafletMarker] of existing) {
      if (!incoming.has(id)) {
        clusterGroup.removeLayer(leafletMarker);
        existing.delete(id);
      }
    }

    const latLngs: [number, number][] = [];
    const toAdd: LeafletMarker[] = [];

    for (const m of markers) {
      const isSelected = selectedEmployeeId === m.employeeId;
      const icon = makeIcon(m.status, isSelected);
      latLngs.push([m.latitude, m.longitude]);

      if (existing.has(m.employeeId)) {
        // Update existing marker position + icon (smooth move, no remove/re-add)
        const lm = existing.get(m.employeeId)!;
        lm.setLatLng([m.latitude, m.longitude]);
        lm.setIcon(icon);
        lm.setPopupContent(buildPopupHtml(m));
      } else {
        // New marker
        const lm = L.marker([m.latitude, m.longitude], { icon }).bindPopup(buildPopupHtml(m));
        existing.set(m.employeeId, lm);
        toAdd.push(lm);
      }
    }

    if (toAdd.length > 0) {
      clusterGroup.addLayers(toAdd);
    }

    markerMapRef.current = existing;

    // Auto-centre: only on first data load (when no markers existed before)
    if (latLngs.length > 0 && existing.size === toAdd.length) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 14 });
    }

    // Pan to selected employee marker if it exists
    if (selectedEmployeeId) {
      const sel = existing.get(selectedEmployeeId);
      if (sel) {
        map.setView(sel.getLatLng(), Math.max(map.getZoom(), 13), { animate: true });
        sel.openPopup();
      }
    }
  }, [markers, selectedEmployeeId]);

  return (
    <div className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <span className="text-sm text-muted-foreground">Loading positions…</span>
        </div>
      )}
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
