'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, Car, CheckCircle2, Clock3, Crosshair, Headphones, History,
  Home, Loader2, Map, MapPin, MessageCircle, Navigation, Package,
  Phone, Search, ShieldAlert, Truck, UserRound, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCreatePickup, usePickups } from '@/hooks/usePickups';
import { useDriverEmitter, useDrivers } from '@/hooks/useDrivers';

const CargoMap = dynamic(() => import('@/components/CargoMap'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-slate-100"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>,
});

type Tab = 'inicio' | 'solicitar' | 'seguimiento' | 'conductor' | 'cuenta';
type LatLng = [number, number];
type GeoResult = { display_name: string; lat: string; lon: string; source: string };

const STATUS: Record<string, { label: string; color: string }> = {
  esperando: { label: 'Esperando conductor', color: 'bg-emerald-100 text-emerald-700' },
  asignado: { label: 'Conductor asignado', color: 'bg-violet-100 text-violet-700' },
  en_camino: { label: 'Conductor en camino', color: 'bg-blue-100 text-blue-700' },
  recogido: { label: 'Recogido', color: 'bg-slate-100 text-slate-700' },
  completado: { label: 'Completado', color: 'bg-slate-100 text-slate-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

export default function CargoCubaApp() {
  const [tab, setTab] = useState<Tab>('inicio');
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [request, setRequest] = useState({
    nombre: '', telefono: '', direccion: '', lat: 0, lng: 0,
    notas: '', horarioReady: '', paquetes: 1,
  });
  const [driver, setDriver] = useState({
    phone: '', nombre: '', mensaje: 'Voy a salir para Chambatina',
    precioServicio: '', direccionRecojo: '', comunidad: '', capacidad: 20,
  });
  const [driverOnline, setDriverOnline] = useState(false);
  const watchRef = useRef<number | null>(null);

  const pickupsQuery = usePickups();
  const pickups = pickupsQuery.data || [];
  const { drivers, connected } = useDrivers();
  const createPickup = useCreatePickup();
  const emitter = useDriverEmitter();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cargocuba_profile');
      if (saved) {
        const profile = JSON.parse(saved);
        setRequest((v) => ({ ...v, nombre: profile.nombre || '', telefono: profile.telefono || '' }));
        setDriver((v) => ({ ...v, nombre: profile.nombre || '', phone: profile.telefono || '' }));
      }
    } catch {}
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  const myRequests = useMemo(() => {
    const phone = request.telefono.replace(/\D/g, '');
    if (!phone) return [];
    return pickups.filter((p) => (p.telefono || '').replace(/\D/g, '') === phone);
  }, [pickups, request.telefono]);

  const activeDrivers = drivers.filter((d) => d.activo);
  const waiting = pickups.filter((p) => p.estado === 'esperando').length;

  const locate = useCallback((forRequest = false) => {
    if (!navigator.geolocation) {
      toast.error('GPS no disponible en este dispositivo');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const pos: LatLng = [coords.latitude, coords.longitude];
      setMyLocation(pos);
      if (forRequest) {
        let direccion = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
        try {
          const r = await fetch(`/api/geocode/reverse?lat=${coords.latitude}&lng=${coords.longitude}`);
          const j = await r.json();
          direccion = j.display_name || j.address || direccion;
        } catch {}
        setRequest((v) => ({ ...v, lat: coords.latitude, lng: coords.longitude, direccion }));
        setAddressQuery(direccion);
      }
      setLocating(false);
    }, () => {
      setLocating(false);
      toast.error('Permite el acceso al GPS para usar tu ubicación');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }, []);

  async function searchAddress() {
    if (addressQuery.trim().length < 3) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(addressQuery.trim())}`);
      const j = await r.json();
      setSuggestions(j.results || []);
      if (!j.results?.length) toast.error('No encontramos esa dirección. Agrega ciudad y estado.');
    } catch {
      toast.error('No se pudo buscar la dirección');
    } finally {
      setSearching(false);
    }
  }

  function selectAddress(item: GeoResult) {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    setRequest((v) => ({ ...v, direccion: item.display_name, lat, lng }));
    setAddressQuery(item.display_name);
    setMyLocation([lat, lng]);
    setSuggestions([]);
  }

  async function submitPickup() {
    if (!request.nombre.trim() || request.telefono.replace(/\D/g, '').length < 8) {
      toast.error('Completa tu nombre y teléfono');
      return;
    }
    if (!request.direccion || !request.lat || !request.lng) {
      toast.error('Busca una dirección o utiliza tu GPS');
      return;
    }
    try {
      await createPickup.mutateAsync({
        nombre: request.nombre.trim(),
        telefono: request.telefono.trim(),
        direccion: request.direccion,
        lat: request.lat,
        lng: request.lng,
        notas: request.notas || null,
        horarioReady: request.horarioReady || null,
        paquetes: request.paquetes,
      });
      localStorage.setItem('cargocuba_profile', JSON.stringify({ nombre: request.nombre, telefono: request.telefono }));
      setRequest((v) => ({ ...v, direccion: '', lat: 0, lng: 0, notas: '', horarioReady: '', paquetes: 1 }));
      setAddressQuery('');
      setTab('seguimiento');
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    } catch {}
  }

  async function saveDriverLocation(position: GeolocationPosition) {
    const payload = {
      phone: driver.phone.trim(), nombre: driver.nombre.trim(),
      lat: position.coords.latitude, lng: position.coords.longitude, activo: true,
      mensaje: driver.mensaje, precioServicio: driver.precioServicio || null,
      direccionRecojo: driver.direccionRecojo || null, comunidad: driver.comunidad || null,
      puntoPartidaLat: position.coords.latitude, puntoPartidaLng: position.coords.longitude,
      capacidad: driver.capacidad, velocidad: position.coords.speed ? position.coords.speed * 2.23694 : null,
      heading: position.coords.heading ?? undefined,
    };
    const r = await fetch('/api/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo actualizar el GPS');
    emitter.sendLocation({ phone: payload.phone, nombre: payload.nombre, lat: payload.lat, lng: payload.lng, heading: payload.heading ?? undefined, speed: payload.velocidad ?? undefined });
    setMyLocation([payload.lat, payload.lng]);
  }

  function startDriver() {
    if (!driver.phone.trim() || !driver.nombre.trim()) {
      toast.error('Completa nombre y teléfono del conductor');
      return;
    }
    if (!navigator.geolocation) {
      toast.error('GPS no disponible');
      return;
    }
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await saveDriverLocation(pos);
        emitter.goOnline(driver.phone.trim(), driver.nombre.trim());
        setDriverOnline(true);
        localStorage.setItem('cargocuba_profile', JSON.stringify({ nombre: driver.nombre, telefono: driver.phone }));
        toast.success('Estás en línea y visible para despacho');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo activar');
      }
    }, () => toast.error('Debes permitir el acceso al GPS'), { enableHighAccuracy: true, timeout: 12000 });
    watchRef.current = navigator.geolocation.watchPosition((pos) => {
      saveDriverLocation(pos).catch(() => {});
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  async function stopDriver() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    await fetch('/api/drivers', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: driver.phone.trim(), activo: false }),
    }).catch(() => {});
    emitter.goOffline(driver.phone.trim());
    setDriverOnline(false);
    toast.success('Ubicación detenida');
  }

  function openSOS() {
    const message = myLocation ? `Necesito ayuda. Mi ubicación: https://maps.google.com/?q=${myLocation[0]},${myLocation[1]}` : 'Necesito ayuda con mi servicio de Cargo Cuba.';
    window.open(`https://wa.me/17867846421?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  const tabItems: Array<{ id: Tab; label: string; icon: typeof Home }> = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'solicitar', label: 'Solicitar', icon: Package },
    { id: 'seguimiento', label: 'Viajes', icon: Navigation },
    { id: 'conductor', label: 'Conductor', icon: Car },
    { id: 'cuenta', label: 'Cuenta', icon: UserRound },
  ];

  return (
    <main className="min-h-dvh bg-slate-50 pb-24 text-slate-950">
      <header className="sticky top-0 z-[1000] border-b border-white/70 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button onClick={() => setTab('inicio')} className="flex items-center gap-3">
            <Image src="/logo-chambita-sm.png" width={42} height={42} alt="Cargo Cuba" className="rounded-2xl" priority />
            <div className="text-left"><p className="text-lg font-black leading-none">Cargo Cuba</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.18em] text-orange-600">por Chambatina</p></div>
          </button>
          <div className="flex items-center gap-2">
            <span className={`hidden rounded-full px-3 py-1 text-xs font-bold sm:block ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{connected ? 'En vivo' : 'Actualizando'}</span>
            <button onClick={() => toast.info(`${waiting} recogidas esperando y ${activeDrivers.length} conductores activos`)} className="relative rounded-full bg-slate-100 p-2.5"><Bell className="h-5 w-5" />{waiting > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white">{waiting}</span>}</button>
          </div>
        </div>
      </header>

      {tab === 'inicio' && (
        <div>
          <section className="relative h-[52dvh] min-h-[390px] overflow-hidden">
            <CargoMap pickups={pickups} drivers={drivers} myLocation={myLocation} selectedDriverPhone={selectedDriver} />
            <div className="pointer-events-none absolute inset-x-0 top-4 z-[500] flex justify-center px-4">
              <div className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-2xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-100"><Map className="h-5 w-5 text-orange-600" /></div>
                <div className="min-w-0"><p className="text-sm font-black">Logística en tiempo real</p><p className="truncate text-xs text-slate-500">{activeDrivers.length} conductores · {waiting} recogidas esperando</p></div>
                <button onClick={() => locate(false)} className="rounded-xl bg-slate-900 p-2.5 text-white">{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}</button>
              </div>
            </div>
          </section>
          <section className="relative z-[600] mx-auto -mt-6 max-w-6xl px-4">
            <div className="grid gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-xl sm:grid-cols-3">
              <button onClick={() => setTab('solicitar')} className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 p-5 text-left text-white">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20"><Package className="h-6 w-6" /></div>
                <div><p className="text-lg font-black">Pedir recogida</p><p className="text-xs text-orange-50">GPS o dirección exacta</p></div>
              </button>
              <button onClick={() => setTab('seguimiento')} className="flex items-center gap-4 rounded-2xl bg-slate-900 p-5 text-left text-white">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><Navigation className="h-6 w-6" /></div>
                <div><p className="text-lg font-black">Seguir servicio</p><p className="text-xs text-slate-300">Chofer y estado en vivo</p></div>
              </button>
              <button onClick={() => setTab('conductor')} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100"><Truck className="h-6 w-6 text-blue-700" /></div>
                <div><p className="text-lg font-black">Soy conductor</p><p className="text-xs text-slate-500">Activar GPS y ruta</p></div>
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Recogida', 'Desde tu puerta', MapPin], ['Ruta', 'Optimizada', Navigation], ['Seguimiento', 'En tiempo real', Crosshair], ['Soporte', 'Directo por WhatsApp', Headphones]].map(([title, text, Icon]) => (
                <div key={String(title)} className="rounded-2xl border border-slate-100 bg-white p-4"><Icon className="mb-3 h-5 w-5 text-orange-500" /><p className="text-sm font-black">{title as string}</p><p className="text-xs text-slate-500">{text as string}</p></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'solicitar' && (
        <section className="mx-auto max-w-2xl px-4 py-6">
          <div className="mb-6"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Nueva solicitud</p><h1 className="mt-2 text-3xl font-black">¿Dónde recogemos?</h1><p className="mt-2 text-sm text-slate-500">Usa el GPS o escribe la dirección completa.</p></div>
          <div className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={request.nombre} onChange={(e) => setRequest((v) => ({ ...v, nombre: e.target.value }))} placeholder="Nombre completo *" className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400" />
              <input value={request.telefono} onChange={(e) => setRequest((v) => ({ ...v, telefono: e.target.value }))} placeholder="Teléfono o WhatsApp *" type="tel" className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400" />
            </div>
            <button onClick={() => locate(true)} disabled={locating} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-bold text-white">{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Usar mi ubicación actual</button>
            <div className="relative">
              <div className="flex gap-2"><input value={addressQuery} onChange={(e) => setAddressQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchAddress()} placeholder="Dirección, ciudad y estado" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-400" /><button onClick={searchAddress} disabled={searching} className="rounded-xl bg-orange-500 px-4 text-white">{searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}</button></div>
              {suggestions.length > 0 && <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-auto rounded-2xl border bg-white p-2 shadow-xl">{suggestions.map((s, i) => <button key={i} onClick={() => selectAddress(s)} className="flex w-full gap-2 rounded-xl p-3 text-left text-xs hover:bg-orange-50"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /><span>{s.display_name}</span></button>)}</div>}
            </div>
            {request.lat !== 0 && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" /> Ubicación confirmada</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Hora preferida<input value={request.horarioReady} onChange={(e) => setRequest((v) => ({ ...v, horarioReady: e.target.value }))} type="time" className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" /></label>
              <label className="text-xs font-bold text-slate-600">Cantidad de paquetes<input value={request.paquetes} onChange={(e) => setRequest((v) => ({ ...v, paquetes: Math.max(1, Number(e.target.value)) }))} type="number" min="1" max="99" className="mt-1 block w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" /></label>
            </div>
            <textarea value={request.notas} onChange={(e) => setRequest((v) => ({ ...v, notas: e.target.value }))} placeholder="Detalles, referencias o instrucciones" rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm" />
            <button onClick={submitPickup} disabled={createPickup.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4 font-black text-white disabled:opacity-60">{createPickup.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Package className="h-5 w-5" />} Solicitar recogida</button>
          </div>
        </section>
      )}

      {tab === 'seguimiento' && (
        <section className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Seguimiento</p><h1 className="mt-2 text-3xl font-black">Tus servicios</h1></div><button onClick={() => pickupsQuery.refetch()} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold">Actualizar</button></div>
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="h-[440px] overflow-hidden rounded-3xl border bg-white shadow-sm"><CargoMap pickups={pickups} drivers={drivers} myLocation={myLocation} selectedDriverPhone={selectedDriver} /></div>
            <div className="space-y-3">
              {!request.telefono && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Escribe tu teléfono en “Solicitar” o “Cuenta” para identificar tus servicios.</div>}
              {myRequests.length === 0 && request.telefono && <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400">No encontramos solicitudes con ese teléfono.</div>}
              {myRequests.map((p) => {
                const status = STATUS[p.estado] || { label: p.estado, color: 'bg-slate-100 text-slate-700' };
                const assigned = drivers.find((d) => d.phone === p.choferAsignado || d.nombre === p.choferAsignado);
                return <article key={p.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{p.direccion}</p><p className="mt-1 text-xs text-slate-500">{p.paquetes} paquete(s) · {new Date(p.createdAt).toLocaleDateString('es')}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${status.color}`}>{status.label}</span></div>{assigned && <button onClick={() => setSelectedDriver(assigned.phone)} className="mt-3 flex w-full items-center justify-between rounded-xl bg-blue-50 p-3 text-left"><span className="text-xs font-bold text-blue-800">🚙 {assigned.nombre}</span><span className="text-[10px] text-blue-600">Seguir en mapa</span></button>}</article>;
              })}
              <div className="rounded-2xl bg-slate-900 p-4 text-white"><p className="font-black">Conductores activos</p><div className="mt-3 space-y-2">{activeDrivers.length === 0 ? <p className="text-xs text-slate-400">No hay conductores transmitiendo ahora.</p> : activeDrivers.map((d) => <button key={d.phone} onClick={() => setSelectedDriver(d.phone)} className="flex w-full items-center justify-between rounded-xl bg-white/10 p-3 text-left"><span className="text-sm font-bold">{d.nombre}</span><span className="text-xs text-emerald-300">● EN VIVO</span></button>)}</div></div>
            </div>
          </div>
        </section>
      )}

      {tab === 'conductor' && (
        <section className="mx-auto max-w-2xl px-4 py-6">
          <div className="mb-6"><p className="text-xs font-black uppercase tracking-[.2em] text-blue-600">Portal móvil</p><h1 className="mt-2 text-3xl font-black">Conductor</h1><p className="mt-2 text-sm text-slate-500">Activa tu GPS solamente durante la ruta.</p></div>
          <div className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
            <div className={`flex items-center justify-between rounded-2xl p-4 ${driverOnline ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}><div><p className="font-black">{driverOnline ? 'Transmitiendo ubicación' : 'Fuera de línea'}</p><p className="text-xs">{driverOnline ? 'Despacho y clientes pueden verte.' : 'Tu ubicación no se está compartiendo.'}</p></div><span className={`h-3 w-3 rounded-full ${driverOnline ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><input value={driver.nombre} onChange={(e) => setDriver((v) => ({ ...v, nombre: e.target.value }))} placeholder="Nombre *" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" /><input value={driver.phone} onChange={(e) => setDriver((v) => ({ ...v, phone: e.target.value }))} placeholder="Teléfono *" type="tel" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" /></div>
            <input value={driver.mensaje} onChange={(e) => setDriver((v) => ({ ...v, mensaje: e.target.value }))} placeholder="Mensaje visible para clientes" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
            <div className="grid gap-3 sm:grid-cols-2"><input value={driver.direccionRecojo} onChange={(e) => setDriver((v) => ({ ...v, direccionRecojo: e.target.value }))} placeholder="Dirección de la base" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" /><input value={driver.comunidad} onChange={(e) => setDriver((v) => ({ ...v, comunidad: e.target.value }))} placeholder="Comunidad o zona" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" /></div>
            <div className="grid gap-3 sm:grid-cols-2"><input value={driver.precioServicio} onChange={(e) => setDriver((v) => ({ ...v, precioServicio: e.target.value }))} placeholder="Precio del servicio" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" /><input value={driver.capacidad} onChange={(e) => setDriver((v) => ({ ...v, capacidad: Math.max(1, Number(e.target.value)) }))} type="number" min="1" placeholder="Capacidad" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" /></div>
            {!driverOnline ? <button onClick={startDriver} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 font-black text-white"><Crosshair className="h-5 w-5" /> Activar GPS y comenzar</button> : <button onClick={stopDriver} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-4 font-black text-white"><X className="h-5 w-5" /> Terminar y dejar de compartir</button>}
            <p className="text-center text-[11px] text-slate-400">El GPS funciona con HTTPS y permiso del teléfono. Mantén esta pantalla abierta durante el recorrido.</p>
          </div>
        </section>
      )}

      {tab === 'cuenta' && (
        <section className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="text-3xl font-black">Cuenta y ayuda</h1>
          <div className="mt-5 space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <input value={request.nombre} onChange={(e) => setRequest((v) => ({ ...v, nombre: e.target.value }))} placeholder="Tu nombre" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
            <input value={request.telefono} onChange={(e) => setRequest((v) => ({ ...v, telefono: e.target.value }))} placeholder="Tu teléfono" type="tel" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
            <button onClick={() => { localStorage.setItem('cargocuba_profile', JSON.stringify({ nombre: request.nombre, telefono: request.telefono })); toast.success('Datos guardados'); }} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white">Guardar datos</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a href="https://wa.me/17867846421" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl bg-emerald-500 p-4 font-black text-white"><MessageCircle className="h-6 w-6" /> Soporte por WhatsApp</a>
            <a href="tel:+17867846421" className="flex items-center gap-3 rounded-2xl bg-blue-600 p-4 font-black text-white"><Phone className="h-6 w-6" /> Llamar a Chambatina</a>
            <button onClick={openSOS} className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-left font-black text-red-700"><ShieldAlert className="h-6 w-6" /> SOS y compartir ubicación</button>
            <Link href="/admin" className="flex items-center gap-3 rounded-2xl bg-slate-100 p-4 font-black text-slate-700"><History className="h-6 w-6" /> Administración</Link>
          </div>
        </section>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-[1200] border-t border-slate-200 bg-white/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {tabItems.map((item) => { const Icon = item.icon; const active = tab === item.id; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold transition ${active ? 'bg-orange-50 text-orange-600' : 'text-slate-400'}`}><Icon className={`h-5 w-5 ${active ? 'stroke-[2.5]' : ''}`} />{item.label}</button>; })}
        </div>
      </nav>
    </main>
  );
}
