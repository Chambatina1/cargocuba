'use client';
// =============================================
// Hook usePickups - CRUD de recogidas con react-query
// =============================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface Pickup {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string;
  lat: number;
  lng: number;
  notas: string | null;
  estado: string;
  choferAsignado: string | null;
  ordenRuta: number | null;
  routeId: number | null;
  fechaRecogida: string | null;
  horarioReady: string | null;
  area: string | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  serviceMinutes: number;
  paquetes: number;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

async function fetchPickups(filter?: { estado?: string; chofer?: string; hoy?: boolean }): Promise<Pickup[]> {
  const params = new URLSearchParams();
  if (filter?.estado) params.set('estado', filter.estado);
  if (filter?.chofer) params.set('chofer', filter.chofer);
  if (filter?.hoy) params.set('hoy', 'true');
  const r = await fetch(`/api/pickups?${params}`);
  const j = await r.json();
  return j.data || [];
}

export function usePickups(filter?: { estado?: string; chofer?: string; hoy?: boolean }) {
  return useQuery({
    queryKey: ['pickups', filter],
    queryFn: () => fetchPickups(filter),
    refetchInterval: 8000, // refresco periodico como complemento al socket
  });
}

export function useCreatePickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Pickup> & { nombre: string; direccion: string; lat: number; lng: number }) => {
      const r = await fetch('/api/pickups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      return j.data as Pickup;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pickups'] });
      toast.success('Recogida creada');
    },
    onError: (e: any) => toast.error(e?.message || 'Error al crear'),
  });
}

export function useUpdatePickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Pickup> & { id: number }) => {
      const r = await fetch('/api/pickups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      return j.data as Pickup;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pickups'] }),
    onError: (e: any) => toast.error(e?.message || 'Error al actualizar'),
  });
}

export function useDeletePickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/pickups?id=${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pickups'] }),
    onError: (e: any) => toast.error(e?.message || 'Error al eliminar'),
  });
}
