'use client';
// =============================================
// CargarListaTab - pegar documento con nombres + direcciones
// y crear todas las recogidas optimizadas de una vez.
// =============================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Zap, CheckCircle2, XCircle, MapPin, Clock } from 'lucide-react';

export default function CargarListaTab({ driverName = 'Yandier', driverStart }: { driverName?: string; driverStart?: [number, number] }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCreate = async () => {
    if (!text.trim()) {
      toast.error('Pegá la lista primero');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch('/api/pickups/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          choferAsignado: driverName,
          puntoPartida: driverStart,
          optimize: true,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setResult(j);
      toast.success(`${j.creadas.length} casas creadas y optimizadas`);
    } catch (e: any) {
      toast.error(e?.message || 'Error al crear');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui', padding: 4, color: '#111' }}>
      {/* Instrucciones */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ClipboardList size={18} color="#2563eb" />
          <strong style={{ fontSize: 14 }}>Cargar lista de recogidas</strong>
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
          Pegá acá el documento con los nombres y direcciones, una por línea. Formato:
          <br />
          <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>
            Nombre — dirección
          </code>
          {' '}
          (separador: <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>—</code>,
          <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>:</code>,
          <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>,</code> o
          <code style={{ background: '#f3f4f6', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>tab</code>)
          <br />
          Ej: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>Olga León — 230 Enterprise Osteen Rd, Osteen, FL 32764</code>
        </div>
      </div>

      {/* Textarea */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #e5e7eb' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Olga León — 230 Enterprise Osteen Rd, Osteen, FL 32764\nMadelaine — 2401 Weatherford Dr, Deltona, FL 32738\nRandy — 2048 Laredo Dr, Deltona, FL 32738\n...'}
          style={{
            width: '100%', minHeight: 220, padding: 12, borderRadius: 10,
            border: '1px solid #d1d5db', fontFamily: 'monospace', fontSize: 12,
            resize: 'vertical', outline: 'none',
          }}
          onFocus={(e) => e.target.style.borderColor = '#2563eb'}
          onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
        />
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
          {text.split(/\r?\n/).filter(l => l.trim()).length} líneas detectadas
        </div>

        <button
          onClick={handleCreate}
          disabled={loading || !text.trim()}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none',
            background: loading ? '#93c5fd' : 'linear-gradient(to right, #2563eb, #4f46e5)',
            color: '#fff', fontWeight: 700, fontSize: 13, marginTop: 10,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {loading ? 'Creando y optimizando...' : 'Crear y optimizar ruta'}
        </button>
      </div>

      {/* Resultado */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {/* Resumen */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
              <span style={{ color: '#16a34a', fontWeight: 700 }}>
                <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 4 }} />
                {result.creadas.length} creadas
              </span>
              {result.fallidas.length > 0 && (
                <span style={{ color: '#dc2626', fontWeight: 700 }}>
                  <XCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {result.fallidas.length} sin dirección
                </span>
              )}
            </div>
          </div>

          {/* Fallidas */}
          {result.fallidas.length > 0 && (
            <div style={{ background: '#fef2f2', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #fecaca' }}>
              <strong style={{ fontSize: 12, color: '#dc2626' }}>⚠ No se encontraron estas direcciones:</strong>
              {result.fallidas.map((f: any, i: number) => (
                <div key={i} style={{ fontSize: 11, color: '#7f1d1d', marginTop: 4 }}>
                  • {f.nombre}: <code>{f.direccion}</code>
                </div>
              ))}
            </div>
          )}

          {/* Ruta optimizada */}
          {result.optimizada && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Zap size={16} color="#2563eb" />
                <strong style={{ fontSize: 13 }}>Ruta optimizada ({result.optimizada.solverUsed})</strong>
                <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>
                  {(result.optimizada.distancia / 1000 * 0.621371).toFixed(1)} mi · {Math.floor(result.optimizada.duracion / 60)} min
                </span>
              </div>
              {result.optimizada.ruta.map((s: any, i: number) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < result.optimizada.ruta.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', background: '#2563eb', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                  }}>{s.orden}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>{s.nombre}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={9} /> {s.direccion.slice(0, 45)}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={10} /> {s.eta}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Mensaje */}
          <div style={{ background: '#eff6ff', borderRadius: 14, padding: 14, border: '1px solid #bfdbfe', fontSize: 11, color: '#1e40af', textAlign: 'center' }}>
            ✅ Las casas están en el mapa. Andá a <strong>cargocuba.onrender.com</strong> para verlas.
          </div>
        </motion.div>
      )}
    </div>
  );
}
