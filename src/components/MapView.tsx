'use client'

import { useEffect, useRef } from 'react'

interface MapViewProps {
  userLat: number | null
  userLng: number | null
  providers: Array<{
    id: string
    name: string
    phone: string
    available: boolean
    rating: number
    lat?: number | null
    lng?: number | null
    photo?: string | null
    carPhoto1?: string | null
    carPhoto2?: string | null
    carPhoto3?: string | null
    carBrand?: string | null
    carModel?: string | null
    bio?: string | null
  }>
  onProviderClick: (provider: typeof providers[0]) => void
  onPhotoClick?: (src: string) => void
}

// Load Leaflet from CDN
function loadLeafletScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).L) { resolve(); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Leaflet'))
    document.head.appendChild(script)
  })
}

const BRAND_COLOR = '#2563eb'

export default function MapView({
  userLat, userLng, providers, onProviderClick, onPhotoClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  const DEFAULT_CENTER: [number, number] = [23.5, -80.5]
  const DEFAULT_ZOOM = 5

  // Update markers function
  function updateMarkers(L: any, providersList: typeof providers, userLatVal: number | null, userLngVal: number | null) {
    if (!mapRef.current) return
    const map = mapRef.current

    // Clear existing markers
    markersRef.current.forEach((m: any) => map.removeLayer(m))
    markersRef.current = []

    // Add provider markers
    providersList.forEach((p) => {
      if (!p.lat || !p.lng) return

      const initial = p.name.charAt(0).toUpperCase()
      const photoSrc = p.photo || ''

      // Water drop marker with profile photo
      const iconHtml = `
        <div style="position:relative;width:52px;height:66px;cursor:pointer;">
          <svg viewBox="0 0 52 66" width="52" height="66" style="position:absolute;top:0;left:0;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
            <defs>
              <clipPath id="drop-${p.id}">
                <path d="M26 0 C26 0 0 28 0 40 C0 51.046 11.654 60 26 60 C40.346 60 52 51.046 52 40 C52 28 26 0 26 0 Z"/>
              </clipPath>
            </defs>
            <path d="M26 0 C26 0 0 28 0 40 C0 51.046 11.654 60 26 60 C40.346 60 52 51.046 52 40 C52 28 26 0 26 0 Z"
              fill="${BRAND_COLOR}" stroke="white" stroke-width="2.5"/>
            ${photoSrc ? `
              <image href="${photoSrc}" x="2" y="2" width="48" height="56" preserveAspectRatio="xMidYMid slice"
                clip-path="url(#drop-${p.id})"/>
            ` : `
              <text x="26" y="36" text-anchor="middle" fill="white" font-size="22" font-weight="bold"
                font-family="system-ui,sans-serif">${initial}</text>
            `}
            ${p.available ? `
              <circle cx="40" cy="12" r="7" fill="#22c55e" stroke="white" stroke-width="2"/>
            ` : ''}
          </svg>
        </div>
      `

      const icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [52, 66],
        iconAnchor: [26, 60],
        popupAnchor: [0, -62],
      })

      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map)

      marker.on('click', () => {
        onProviderClick(p)
      })

      markersRef.current.push(marker)
    })

    // User location marker (blue pulsing dot)
    if (userLatVal && userLngVal) {
      const userIcon = L.divIcon({
        html: `<div style="position:relative;width:20px;height:20px;">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(59,130,246,0.5);z-index:2;"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:20px;height:20px;background:rgba(59,130,246,0.25);border-radius:50%;animation:userpulse 2s infinite;"></div>
          <style>@keyframes userpulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.7}50%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}</style>
        </div>`,
        className: '',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      })
      const userMarker = L.marker([userLatVal, userLngVal], { icon: userIcon, zIndexOffset: 1000 }).addTo(map)
      markersRef.current.push(userMarker)
    }

    // Fit bounds to show Florida + Caribbean region
    const region = [
      L.latLng(21.0, -85.5),
      L.latLng(23.5, -74.0),
      L.latLng(30.5, -87.5),
      L.latLng(25.0, -80.0),
    ]
    const points = [...region]
    markersRef.current.forEach((m: any) => points.push(m.getLatLng()))
    if (userLatVal && userLngVal) points.push(L.latLng(userLatVal, userLngVal))
    try {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 8 })
    } catch { /* ignore */ }
  }

  // Init map
  useEffect(() => {
    let cancelled = false
    const initMap = async () => {
      if (!containerRef.current) return
      await loadLeafletScript()
      const L = (window as any).L
      if (!L || cancelled) return

      if (mapRef.current) {
        updateMarkers(L, providers, userLat, userLng)
        return
      }

      const center = DEFAULT_CENTER
      const zoom = DEFAULT_ZOOM

      const map = L.map(containerRef.current, {
        zoomControl: false,
      }).setView(center, zoom)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '',
      }).addTo(map)

      mapRef.current = map
      updateMarkers(L, providers, userLat, userLng)
    }

    initMap()
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [])

  // Update markers when data changes
  useEffect(() => {
    const L = (window as any).L
    if (mapRef.current && L) updateMarkers(L, providers, userLat, userLng)
  }, [providers, userLat, userLng])

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  )
}
