// Declaracion ambient del binding opcional node_or_tools.
// Si el paquete no esta instalado, el codigo en ortools-solver.ts hace try/catch
// y cae al fallback savings-TS. Esta declaracion solo evita errores de tipos.
declare module 'node_or_tools' {
  export interface WorkerOptions {
    numNodes: number;
    vehicles: number;
    vehicleCapacity?: number[];
  }
  export interface WorkerSolution {
    routes: { path: number[] }[];
  }
  export class Worker {
    constructor(opts: WorkerOptions);
    setDistance(i: number, j: number, d: number): void;
    setTime(i: number, j: number, t: number): void;
    setDemandOnNode(n: number, d: number): void;
    setVehicleTimeWindow(v: number, start: number, end: number): void;
    setTimeWindowForNode(n: number, start: number, end: number): void;
    setServiceTimeForNode(n: number, sec: number): void;
    solve(): WorkerSolution;
  }
}
