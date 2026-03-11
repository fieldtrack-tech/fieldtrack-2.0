"use client";

import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MapPin } from "lucide-react";
import { GpsLocation } from "@/types";

interface RouteMapProps {
  locations: GpsLocation[];
}

export function RouteMap({ locations }: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mapContainerRef.current) return;
    if (locations.length === 0) return;

    let mapInstance: mapboxgl.Map | null = null;

    void (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) {
        throw new Error("Missing NEXT_PUBLIC_MAPBOX_TOKEN environment variable");
      }
      mapboxgl.accessToken = token;

      const sorted = [...locations].sort(
        (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );

      const coordinates: [number, number][] = sorted.map((loc) => [
        loc.longitude,
        loc.latitude,
      ]);

      if (!mapContainerRef.current) return;

      mapInstance = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: coordinates[0],
        zoom: 13,
      });

      mapInstance.on("load", () => {
        if (!mapInstance) return;

        mapInstance.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates,
            },
          },
        });

        mapInstance.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#3b82f6", "line-width": 4 },
        });

        const start = coordinates[0];
        const end = coordinates[coordinates.length - 1];

        const startEl = document.createElement("div");
        startEl.style.cssText =
          "width:14px;height:14px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4)";
        new mapboxgl.Marker({ element: startEl }).setLngLat(start).addTo(mapInstance);

        const endEl = document.createElement("div");
        endEl.style.cssText =
          "width:14px;height:14px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4)";
        new mapboxgl.Marker({ element: endEl }).setLngLat(end).addTo(mapInstance);

        const bounds = coordinates.reduce(
          (b, coord) => b.extend(coord as [number, number]),
          new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
        );

        mapInstance.fitBounds(bounds, { padding: 60 });
      });
    })();

    return () => {
      mapInstance?.remove();
    };
  }, [locations]);

  if (locations.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No route data"
        description="GPS location data is not available for this session."
      />
    );
  }

  return <div ref={mapContainerRef} className="h-96 w-full rounded-lg overflow-hidden" />;
}
