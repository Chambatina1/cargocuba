'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast, Toaster } from 'sonner';
import RutasTab from '@/components/admin/RutasTab';

// ─── Types ───────────────────────────────────────────────────────────────
interface Pickup {
  id: number; nombre: string; telefono: string | null; direccion: string;
  lat: number; lng: number; notas: string | null; horarioReady: string | null;
  estado: string; origen: string; choferAsignado: string | null;
  ordenRuta: number | null; fechaRecogida: string | null;
  createdAt: string; updatedAt: string;
}
interface Driver {
  id: number; phone: string; nombre: string; lat: number; lng: number;
  activo: boolean; mensaje: string | null; precioServicio: string | null;
  direccionRecojo: string | null; comunidad: string | null; updatedAt: string;
}

const CHOFERES = ['Luis Martinez', 'Carlos Rodriguez', 'Miguel Perez', 'Roberto Garcia', 'Jose Hernandez', 'Ana Lopez'];

const ESTADOS = [
  { value: 'esperando', label: 'En Espera', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'recogido', label: 'Recogido', color: 'bg-purple-100 text-purple-700' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-red-100 text-red-700' },
];

// ─── LOGIN ───────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!pw.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/admin/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (r.ok) { onLogin(); }
      else { toast.error('Contrasena incorrecta'); }
    } catch { toast.error('Error de conexion'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">CargoCuba Admin</h1>
          <p className="text-blue-300/70 text-sm mt-1">Flota GPS y Recogidas</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
          <input
            type="password" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Contrasena de administrador"
            className="w-full h-12 px-4 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm mb-4"
            autoFocus
          />
          <button onClick={handleLogin} disabled={loading || !pw.trim()}
            className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 transition-all text-sm shadow-lg shadow-blue-600/20">
            {loading ? 'Entrando...' : 'Entrar al Admin'}
          </button>
        </div>
        <p className="text-center text-white/30 text-xs mt-6">Acceso restringido al personal autorizado</p>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────
export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('cc-admin') === '1';
    return false;
  });
  const [tab, setTab] = useState<'recogidas' | 'choferes' | 'rutas'>('recogidas');
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroChofer, setFiltroChofer] = useState('');

  // Load data
  const loadPickups = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroChofer) params.set('chofer', filtroChofer);
      const r = await fetch(`/api/pickups?${params}`, { headers: { 'x-admin-key': 'chambatina2025' } });
      const j = await r.json();
      if (j.ok) setPickups(j.data || []);
    } catch {}
    setLoading(false);
  }, [filtroEstado, filtroChofer]);

  const loadDrivers = useCallback(async () => {
    try {
      const r = await fetch('/api/drivers');
      const j = await r.json();
      if (j.ok) setDrivers(j.data || []);
    } catch {}
  }, []);

  useEffect(() => { loadPickups(); loadDrivers(); }, [loadPickups, loadDrivers]);

  // Auto-refresh every 15s
  useEffect(() => {
    const iv = setInterval(() => { loadPickups(); loadDrivers(); }, 15000);
    return () => clearInterval(iv);
  }, [loadPickups, loadDrivers]);

  // Actions
  const updatePickup = async (id: number, data: any) => {
    try {
      const r = await fetch('/api/pickups', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-key': 'chambatina2025' },
        body: JSON.stringify({ id, ...data }),
      });
      const j = await r.json();
      if (j.ok) { toast.success('Actualizado'); loadPickups(); }
      else toast.error(j.error || 'Error');
    } catch { toast.error('Error de conexion'); }
  };

  const deletePickup = async (id: number) => {
    try {
      const r = await fetch(`/api/pickups?id=${id}`, { method: 'DELETE', headers: { 'x-admin-key': 'chambatina2025' } });
      const j = await r.json();
      if (j.ok) { toast.success('Eliminado'); loadPickups(); }
    } catch {}
  };

  const deactivateDriver = async (phone: string) => {
    try {
      const r = await fetch('/api/drivers', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-key': 'chambatina2025' },
        body: JSON.stringify({ phone, activo: false }),
      });
      const j = await r.json();
      if (j.ok) { toast.success('Chofer desactivado'); loadDrivers(); }
    } catch {}
  };

  const logout = async () => {
    await fetch('/admin/api/login', { method: 'DELETE' });
    localStorage.removeItem('cc-admin');
    setLoggedIn(false);
  };

  // MODO TEMPORAL: admin sin contraseña (configuración pendiente de ADMIN_PASSWORD en Render).
  // Si en algún momento se configura ADMIN_PASSWORD en Render, se puede restaurar el login
  // reemplazando esta línea por: if (!loggedIn) return <LoginScreen onLogin={() => { localStorage.setItem('cc-admin', '1'); setLoggedIn(true); }} />;
  if (false) return <LoginScreen onLogin={() => { localStorage.setItem('cc-admin', '1'); setLoggedIn(true); }} />;

  // Stats
  const esperando = pickups.filter(p => p.estado === 'esperando').length;
  const recogidos = pickups.filter(p => p.estado === 'recogido').length;
  const activos = drivers.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-center" />
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-slate-900 to-blue-900 shadow-lg">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-base">CargoCuba Admin</h1>
              <p className="text-blue-300/70 text-[11px]">Flota GPS y Recogidas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Stats badges */}
            <div className="hidden sm:flex items-center gap-2 mr-2">
              <span className="flex items-center gap-1 text-[11px] font-bold bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> {esperando} espera
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold bg-purple-500/20 text-purple-300 px-2 py-1 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-purple-400" /> {recogidos} recogido
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold bg-blue-500/20 text-blue-300 px-2 py-1 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" /> {activos} chofers
              </span>
            </div>
            <a href="/" className="text-blue-300 hover:text-white text-xs font-medium px-2 py-1 rounded-lg hover:bg-white/10 transition-all">
              Ir al Mapa
            </a>
            <button onClick={logout} className="text-red-300 hover:text-white text-xs font-medium px-2 py-1 rounded-lg hover:bg-red-500/20 transition-all">
              Salir
            </button>
          </div>
        </div>

        {/* Mobile stats */}
        <div className="sm:hidden flex items-center gap-2 px-4 pb-2">
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {esperando}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold text-purple-300">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" /> {recogidos}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> {activos} chofers
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto p-4">
        {/* Tabs */}
        <div className="flex bg-white rounded-xl p-1 shadow-sm border border-slate-200 mb-4">
          <button onClick={() => setTab('recogidas')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'recogidas' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
            Recogidas ({pickups.length})
          </button>
          <button onClick={() => setTab('choferes')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'choferes' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
            Chofers ({drivers.length})
          </button>
          <button onClick={() => setTab('rutas')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${tab === 'rutas' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
            Rutas 🚀
          </button>
        </div>

        {/* ═══ RECOGIDAS TAB ═══ */}
        {tab === 'recogidas' && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">Todos los estados</option>
                {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
              <select value={filtroChofer} onChange={e => setFiltroChofer(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">Todos los chofers</option>
                {CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* List */}
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-sm">Cargando...</div>
            ) : pickups.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm">Sin solicitudes</p>
                <p className="text-slate-300 text-xs mt-1">Las recogidas aparecen aqui cuando los clientes las solicitan</p>
              </div>
            ) : (
              pickups.map(p => {
                const estadoInfo = ESTADOS.find(e => e.value === p.estado);
                const isEsp = p.estado === 'esperando';
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Main row */}
                    <div className="px-4 py-3 flex items-center gap-3">
                      {/* Status dot */}
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isEsp ? 'bg-emerald-500' : p.estado === 'recogido' ? 'bg-purple-500' : 'bg-red-400'}`} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">{p.nombre}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${estadoInfo?.color || ''}`}>
                            {estadoInfo?.label || p.estado}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">{p.direccion}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                          {p.choferAsignado && <span>Chofer: {p.choferAsignado}</span>}
                          {p.horarioReady && <span>Listo: {p.horarioReady}</span>}
                          <span>{new Date(p.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {p.telefono && (
                          <a href={`tel:${p.telefono}`} className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-all" title="Llamar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          </a>
                        )}
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer"
                          className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-all" title="Navegar">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </a>
                        {isEsp ? (
                          <button onClick={() => updatePickup(p.id, { estado: 'recogido', fechaRecogida: new Date().toISOString() })}
                            className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center hover:bg-purple-100 transition-all" title="Marcar Recogido">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </button>
                        ) : p.estado === 'recogido' ? (
                          <button onClick={() => updatePickup(p.id, { estado: 'esperando', fechaRecogida: null })}
                            className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-all" title="Volver a Espera">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          </button>
                        ) : null}
                        <button onClick={() => { if (confirm('Eliminar esta recogida?')) deletePickup(p.id); }}
                          className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all" title="Eliminar">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* Expanded: assign chofer + details */}
                    <div className="px-4 pb-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                      <select value={p.choferAsignado || ''} onChange={e => updatePickup(p.id, { choferAsignado: e.target.value || null })}
                        className="h-8 px-2 rounded-lg border border-slate-200 text-[11px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300 max-w-[140px]">
                        <option value="">Sin chofer...</option>
                        {CHOFERES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input type="time" value={p.horarioReady || ''} onChange={e => updatePickup(p.id, { horarioReady: e.target.value })}
                        className="h-8 px-2 rounded-lg border border-slate-200 text-[11px] bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                      <span className="text-[10px] text-slate-300">
                        {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                        {p.notas && ` · ${p.notas}`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ CHOFERS TAB ═══ */}
        {tab === 'choferes' && (
          <div className="space-y-3">
            {drivers.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm">Sin chofers activos</p>
                <p className="text-slate-300 text-xs mt-1">Los choferes aparecen aqui cuando activan GPS</p>
              </div>
            ) : (
              drivers.map(d => {
                const timeAgo = Math.round((Date.now() - new Date(d.updatedAt).getTime()) / 60000);
                const timeLabel = timeAgo < 1 ? 'ahora' : timeAgo < 60 ? `hace ${timeAgo}min` : `hace ${Math.floor(timeAgo / 60)}h`;
                return (
                  <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
                      <span className="text-lg">🚛</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{d.nombre}</p>
                      <p className="text-xs text-slate-400">{timeLabel}{d.comunidad ? ` · ${d.comunidad}` : ''}</p>
                      {d.mensaje && <p className="text-xs text-blue-600 font-medium mt-0.5 truncate">{d.mensaje}</p>}
                      {d.precioServicio && <p className="text-xs text-green-600 font-bold">{d.direccionRecojo ? `${d.direccionRecojo} · ` : ''}${d.precioServicio}</p>}
                      <p className="text-[10px] text-slate-300 mt-0.5">{d.phone} · {d.lat.toFixed(4)}, {d.lng.toFixed(4)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <a href={`tel:${d.phone}`} className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                      </a>
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`} target="_blank" rel="noopener noreferrer"
                        className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </a>
                      <button onClick={() => { if (confirm(`Desactivar a ${d.nombre}?`)) deactivateDriver(d.phone); }}
                        className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all" title="Desactivar">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══ RUTAS TAB (Optimizador VRP OR-Tools) ═══ */}
        {tab === 'rutas' && (
          <RutasTab />
        )}
      </main>
    </div>
  );
}