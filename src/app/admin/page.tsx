'use client'

import { useState, useEffect, useCallback } from 'react'

const CATEGORIES: Record<string, { label: string; emoji: string; color: string }> = {
  pasaje: { label: 'Automóvil de Pasaje', emoji: '🚗', color: '#ea580c' },
  carga: { label: 'Automóvil de Carga', emoji: '🚚', color: '#7c3aed' },
  comida: { label: 'Automóvil de Comida', emoji: '🍕', color: '#dc2626' },
  barbero: { label: 'Automóvil de Barberos', emoji: '💈', color: '#2563eb' },
  fregador: { label: 'Automóvil de Fregado', emoji: '🧹', color: '#16a34a' },
  recreativo: { label: 'Automóvil Recreativo', emoji: '🚘', color: '#e11d48' },
  bote: { label: 'Bote Recreativo', emoji: '⛵', color: '#0891b2' },
  mascotas: { label: 'Automóvil de Mascotas', emoji: '🐕', color: '#d97706' },
  cerrajeria: { label: 'Automóvil de Llaves', emoji: '🔑', color: '#6d28d9' },
  grua: { label: 'Grúas', emoji: '🏗️', color: '#be185d' },
  banco_energia: { label: 'Banco de Energía', emoji: '🔋', color: '#059669' },
}

const VEHICLE_TYPES: Record<string, string> = {
  bicitaxi: 'Bicitaxi', carro_ruso: 'Carro Ruso', triciclo: 'Triciclo',
  carro_moderno: 'Carro Moderno', almendron: 'Almendrón',
  camion_mediano: 'Camión Mediano', camion_grande: 'Camión Grande',
  carro_recreativo: 'Carro Recreativo', bote_recreativo: 'Bote Recreativo',
  carro_mascotas: 'Carro de Mascotas', grua: 'Grúa', banco_energia: 'Carro Banco de Energía',
}

interface Provider {
  id: string; name: string; phone: string; pin: string
  serviceCategory: string; vehicleType: string
  lat: number; lng: number
  active: boolean; available: boolean; suspended: boolean
  suspendedReason: string | null
  rating: number; totalJobs: number
  photo: string | null; bio: string | null; businessName: string | null
  services: string | null; priceRange: string | null; schedule: string | null
  carPhoto1: string | null; carPhoto2: string | null; carPhoto3: string | null
  notes: string | null; createdAt: string
  route1From: string | null; route1To: string | null
  route2From: string | null; route2To: string | null
  route3From: string | null; route3To: string | null
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [resetPinId, setResetPinId] = useState<string | null>(null)
  const [newPin, setNewPin] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-token': adminToken,
  }), [adminToken])

  const flash = (text: string) => { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('all', 'true')
      const res = await fetch(`/api/admin/providers?${params}`, { headers: headers() })
      if (res.ok) setProviders(await res.json())
      else if (res.status === 401) { setAuthenticated(false); setAdminToken('') }
    } catch { /* ignore */ }
    setLoading(false)
  }, [search, headers])

  useEffect(() => {
    if (authenticated) fetchProviders()
  }, [authenticated, fetchProviders])

  const handleLogin = async () => {
    setLoginError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setAdminToken(data.token)
        setAuthenticated(true)
      } else setLoginError(data.error || 'Error')
    } catch { setLoginError('Error de conexión') }
  }

  const handleSave = async () => {
    try {
      const url = editingId
        ? `/api/admin/providers/${editingId}`
        : '/api/admin/providers'
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        flash(editingId ? 'Proveedor actualizado' : 'Proveedor creado')
        setShowModal(false); setEditingId(null); setForm({})
        fetchProviders()
      } else flash(data.error || 'Error')
    } catch { flash('Error de conexión') }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/admin/providers/${deleteId}`, { method: 'DELETE', headers: headers() })
      const data = await res.json()
      if (res.ok) { flash(`${data.deletedName} eliminado`); setDeleteId(null); fetchProviders() }
      else flash(data.error || 'Error')
    } catch { flash('Error') }
  }

  const handleResetPin = async () => {
    if (!resetPinId) return
    try {
      const res = await fetch(`/api/admin/providers/${resetPinId}/reset-pin`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ pin: newPin || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        flash(`PIN de ${data.name}: ${data.newPin}`)
        setResetPinId(null); setNewPin(''); fetchProviders()
      } else flash(data.error || 'Error')
    } catch { flash('Error') }
  }

  const handleToggle = async (id: string, field: 'active' | 'available' | 'suspended', value: boolean) => {
    try {
      const res = await fetch(`/api/admin/providers/${id}`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ [field]: !value }),
      })
      if (res.ok) fetchProviders()
    } catch { flash('Error') }
  }

  const openEdit = (p: Provider) => {
    setEditingId(p.id)
    setForm({
      name: p.name, phone: p.phone, pin: p.pin,
      serviceCategory: p.serviceCategory, vehicleType: p.vehicleType,
      businessName: p.businessName || '', bio: p.bio || '',
      priceRange: p.priceRange || '', schedule: p.schedule || '',
      notes: p.notes || '', lat: String(p.lat || ''), lng: String(p.lng || ''),
      route1From: p.route1From || '', route1To: p.route1To || '',
      route2From: p.route2From || '', route2To: p.route2To || '',
      route3From: p.route3From || '', route3To: p.route3To || '',
    })
    setShowModal(true)
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', phone: '', pin: '1234', serviceCategory: 'pasaje', vehicleType: 'carro_moderno' })
    setShowModal(true)
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const canvas = document.createElement('canvas')
      const MAX = 400
      img.onload = () => {
        let w = img.width, h = img.height
        if (w > MAX || h > MAX) { if (w > h) { h = (h * MAX) / w; w = MAX } else { w = (w * MAX) / h; h = MAX } }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  // ===== LOGIN SCREEN =====
  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: 'white', borderRadius: 20, padding: 40, maxWidth: 380, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🛡️</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Panel de Administración</h1>
            <p style={{ fontSize: 14, color: '#666', marginTop: 4 }}>Chambita</p>
          </div>
          <input
            type="password" placeholder="Contraseña de administrador"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
          />
          {loginError && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{loginError}</p>}
          <button onClick={handleLogin} style={{ width: '100%', padding: 14, borderRadius: 12, background: '#ea580c', color: 'white', border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 16 }}>
            Entrar
          </button>
          <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 20 }}>
            Contraseña por defecto: chambita2025
          </p>
        </div>
      </div>
    )
  }

  // ===== ADMIN PANEL =====
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 50 }}>
        <span style={{ fontSize: 24 }}>🛡️</span>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#111', flex: 1, margin: 0 }}>Admin Chambita</h1>
        <span style={{ fontSize: 13, color: '#64748b' }}>{providers.length} conductores</span>
        <button onClick={() => { setAuthenticated(false); setAdminToken('') }} style={{ padding: '6px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: 'none', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          Salir
        </button>
      </div>

      {/* Message toast */}
      {msg && (
        <div style={{ position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', background: '#111', color: 'white', padding: '10px 24px', borderRadius: 12, fontSize: 14, fontWeight: 500, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {msg}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 20 }}>
        {/* Actions bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Buscar por nombre o teléfono..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }}
          />
          <button onClick={openCreate} style={{ padding: '10px 20px', borderRadius: 12, background: '#ea580c', color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Nuevo Conductor
          </button>
          <button onClick={fetchProviders} style={{ padding: '10px 16px', borderRadius: 12, background: 'white', border: '1px solid #e2e8f0', fontSize: 14, cursor: 'pointer' }}>
            🔄 Refrescar
          </button>
        </div>

        {/* Provider list */}
        {loading ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Cargando...</p>
        ) : providers.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>No se encontraron conductores</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {providers.map(p => {
              const cat = CATEGORIES[p.serviceCategory]
              return (
                <div key={p.id} style={{
                  background: 'white', borderRadius: 14, padding: 16,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  border: `2px solid ${p.suspended ? '#fecaca' : p.available ? '#bbf7d0' : '#f1f5f9'}`,
                  opacity: p.active ? 1 : 0.6,
                }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Photo */}
                    <div style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
                      {p.photo ? <img src={p.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: cat?.color || '#ea580c', color: 'white', fontSize: 22, fontWeight: 700 }}>
                          {p.name.charAt(0)}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{p.name}</span>
                        {p.businessName && <span style={{ fontSize: 12, color: '#64748b' }}>({p.businessName})</span>}
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: cat?.color || '#ea580c', color: 'white', fontWeight: 600 }}>
                          {cat?.emoji} {cat?.label}
                        </span>
                        {p.available && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>EN VIVO</span>}
                        {p.suspended && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fecaca', color: '#dc2626', fontWeight: 600 }}>SUSPENDIDO</span>}
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span>📱 {p.phone}</span>
                        <span>🔑 PIN: <strong>{p.pin}</strong></span>
                        <span>⭐ {p.rating.toFixed(1)}</span>
                        <span>🚗 {VEHICLE_TYPES[p.vehicleType] || p.vehicleType}</span>
                        <span>📍 {p.lat?.toFixed(2)}, {p.lng?.toFixed(2)}</span>
                      </div>
                      {p.bio && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, margin: '4px 0 0' }}>{p.bio}</p>}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => openEdit(p)} style={{ padding: '6px 12px', borderRadius: 8, background: '#eff6ff', color: '#2563eb', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✏️ Editar</button>
                        <button onClick={() => setResetPinId(p.id)} style={{ padding: '6px 12px', borderRadius: 8, background: '#fef9c3', color: '#a16207', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🔑 PIN</button>
                        <button onClick={() => setDeleteId(p.id)} style={{ padding: '6px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🗑️</button>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleToggle(p.id, 'available', p.available)} style={{ padding: '4px 10px', borderRadius: 6, background: p.available ? '#dcfce7' : '#f1f5f9', color: p.available ? '#16a34a' : '#64748b', border: 'none', fontSize: 11, cursor: 'pointer' }}>
                          {p.available ? '🟢 Vivo ON' : '⚪ Vivo OFF'}
                        </button>
                        <button onClick={() => handleToggle(p.id, 'active', p.active)} style={{ padding: '4px 10px', borderRadius: 6, background: p.active ? '#dcfce7' : '#fecaca', color: p.active ? '#16a34a' : '#dc2626', border: 'none', fontSize: 11, cursor: 'pointer' }}>
                          {p.active ? '✅ Activo' : '❌ Inactivo'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== EDIT/CREATE MODAL ===== */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, padding: 24, maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px' }}>{editingId ? `Editar: ${form.name}` : 'Nuevo Conductor'}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { key: 'name', label: 'Nombre', full: true },
                { key: 'phone', label: 'Teléfono' },
                { key: 'pin', label: 'PIN (4-6 dígitos)' },
                { key: 'businessName', label: 'Nombre del negocio', full: true },
                { key: 'serviceCategory', label: 'Categoría', select: Object.entries(CATEGORIES).map(([k, v]) => [k, `${v.emoji} ${v.label}`]) },
                { key: 'vehicleType', label: 'Tipo de vehículo', select: Object.entries(VEHICLE_TYPES).map(([k, v]) => [k, v]) },
                { key: 'bio', label: 'Descripción', full: true, textarea: true },
                { key: 'priceRange', label: 'Precio' },
                { key: 'schedule', label: 'Horario' },
                { key: 'lat', label: 'Latitud' },
                { key: 'lng', label: 'Longitud' },
                { key: 'route1From', label: 'Ruta 1 Desde' },
                { key: 'route1To', label: 'Ruta 1 Hasta' },
                { key: 'route2From', label: 'Ruta 2 Desde' },
                { key: 'route2To', label: 'Ruta 2 Hasta' },
                { key: 'route3From', label: 'Ruta 3 Desde' },
                { key: 'route3To', label: 'Ruta 3 Hasta' },
                { key: 'notes', label: 'Notas', full: true, textarea: true },
              ].map(f => (
                <div key={f.key} style={f.full ? { gridColumn: '1 / -1' } : {}}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  {f.select ? (
                    <select value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}>
                      {f.select.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>
                  ) : f.textarea ? (
                    <textarea value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} rows={2} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, resize: 'vertical' }} />
                  ) : (
                    <input value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
                  )}
                </div>
              ))}
            </div>

            {/* Photo upload */}
            {editingId && (
              <div style={{ marginTop: 16, padding: 16, background: '#f8fafc', borderRadius: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Fotos</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {['photo', 'carPhoto1', 'carPhoto2', 'carPhoto3'].map((key, i) => (
                    <div key={key}>
                      <label style={{ cursor: 'pointer' }}>
                        <input type="file" accept="image/*" className="hidden" onChange={async e => {
                          const file = e.target.files?.[0]
                          if (file) { const b64 = await fileToBase64(file); setForm({ ...form, [key]: b64 }) }
                        }} />
                        <div style={{ width: 64, height: 64, borderRadius: 10, border: '2px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {(form as any)[key] ? <img src={(form as any)[key]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                            <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>{['Perfil', 'Auto 1', 'Auto 2', 'Auto 3'][i]}</span>
                          )}
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleSave} style={{ flex: 1, padding: 12, borderRadius: 12, background: '#ea580c', color: 'white', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                {editingId ? 'Guardar Cambios' : 'Crear Conductor'}
              </button>
              <button onClick={() => setShowModal(false)} style={{ padding: '12px 20px', borderRadius: 12, background: '#f1f5f9', border: 'none', fontSize: 14, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== RESET PIN MODAL ===== */}
      {resetPinId && (
        <div onClick={() => setResetPinId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, padding: 24, maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>🔑 Resetear PIN</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>Deja vacío para generar un PIN aleatorio</p>
            <input placeholder="Nuevo PIN (4-6 dígitos)" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 15, marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleResetPin} style={{ flex: 1, padding: 12, borderRadius: 10, background: '#f59e0b', color: 'white', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Generar PIN</button>
              <button onClick={() => setResetPinId(null)} style={{ padding: '12px 20px', borderRadius: 10, background: '#f1f5f9', border: 'none', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DELETE CONFIRM MODAL ===== */}
      {deleteId && (
        <div onClick={() => setDeleteId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 20, padding: 24, maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', margin: '0 0 8px' }}>🗑️ Eliminar Conductor</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>Esta acción no se puede deshacer. Se eliminará toda la información del conductor.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDelete} style={{ flex: 1, padding: 12, borderRadius: 10, background: '#dc2626', color: 'white', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Sí, Eliminar</button>
              <button onClick={() => setDeleteId(null)} style={{ padding: '12px 20px', borderRadius: 10, background: '#f1f5f9', border: 'none', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
