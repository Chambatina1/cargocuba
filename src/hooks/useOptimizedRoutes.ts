'use client';
// =============================================
// Hook useOptimizedRoutes - lanza optimizacion VRP y consulta rutas activas
// =============================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { RoutingResponse, PersistedRoute } from '@/lib/routing/types';

interface OptimizeParams {
  driverPhones?: string[];
  pickupIds?: number[];
  persist?: boolean;
}

async function optimize(params: OptimizeParams): Promise<RoutingResponse> {
  const r = await fetch('/api/routing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j as RoutingResponse;
}

export function useOptimize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: optimize,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['pickups'] });
      toast.success(`${data.routes.length} rutas optimizadas con ${data.solverUsed} (${data.ms}ms)`);
    },
    onError: (e: any) => toast.error(e?.message || 'Error optimizando'),
  });
}

export interface ActiveRoute {
  id: number;
  choferPhone: string;
  estado: string;
  secuencia: any;
  polyline: [number, number][] | null;
  distanciaTotal: number;
  duracionTotal: number;
  paradasTotal: number;
  paradasHechas: number;
  solverUsed: string | null;
  startedAt: string | null;
  createdAt: string;
  stops: {
    id: number;
    pickupId: number;
    orden: number;
    estado: string;
    llegadaEstimada: string | null;
    llegadaReal: string | null;
  }[];
}

export function useActiveRoutes() {
  return useQuery<ActiveRoute[]>({
    queryKey: ['routes', 'activa'],
    queryFn: async () => {
      const r = await fetch('/api/routing?estado=activa');
      const j = await r.json();
      return j.data || [];
    },
    refetchInterval: 5000,
  });
}
