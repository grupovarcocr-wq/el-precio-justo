import catalog from "./productos.json";

/**
 * Catálogo del Té de Leandro Vargas Corao.
 * Para agregar productos: sumá una entrada en `productos.json` con
 * `id` único, `nombre`, `precio` (₡ reales — no inventar) y nombres de
 * imagen. Si aún no hay foto, usá `producto-01.jpeg` / `precio-01.jpeg`
 * como placeholder; la UI no bloquea por imágenes faltantes.
 */
export type Producto = {
  id: number;
  nombre: string;
  precio: number;
  imagenProducto: string;
  imagenPrecio: string;
};

export const PRODUCTOS = catalog as Producto[];

const byId = new Map(PRODUCTOS.map((p) => [p.id, p]));

export function getProductoById(id: number): Producto | null {
  return byId.get(id) ?? null;
}

export function getProducto(index: number): Producto | null {
  if (index < 0 || index >= PRODUCTOS.length) return null;
  return PRODUCTOS[index] ?? null;
}

export function formatColones(amount: number): string {
  return `₡${amount.toLocaleString("es-CR")}`;
}

export type PublicProducto = {
  id: number;
  nombre: string;
  imagenProducto: string;
  imagenPrecio?: string;
  precio?: number;
};

export function toPublicProducto(
  producto: Producto,
  revealed: boolean,
): PublicProducto {
  if (revealed) {
    return {
      id: producto.id,
      nombre: producto.nombre,
      imagenProducto: producto.imagenProducto,
      imagenPrecio: producto.imagenPrecio,
      precio: producto.precio,
    };
  }
  return {
    id: producto.id,
    nombre: producto.nombre,
    imagenProducto: producto.imagenProducto,
  };
}

/** Round to a "nice" colones step based on magnitude. */
export function niceColones(value: number): number {
  const v = Math.max(50, Math.round(value));
  let step: number;
  if (v < 500) step = 50;
  else if (v < 2000) step = 100;
  else if (v < 10000) step = 250;
  else if (v < 50000) step = 500;
  else if (v < 200000) step = 1000;
  else step = 5000;
  return Math.max(step, Math.round(v / step) * step);
}

/**
 * 4 opciones de precio: 1 correcta (precio real del catálogo) + 3 distractores
 * plausibles alrededor del precio. No inventa el precio correcto.
 */
export function generatePriceOptions(realPrice: number): number[] {
  const correct = Math.round(realPrice);
  const factors = [0.55, 0.7, 0.85, 1.15, 1.3, 1.45, 1.65, 1.9];
  // Shuffle factor order so distractors vary per round
  for (let i = factors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = factors[i]!;
    factors[i] = factors[j]!;
    factors[j] = tmp;
  }

  const options = new Set<number>([correct]);
  for (const f of factors) {
    if (options.size >= 4) break;
    let candidate = niceColones(correct * f);
    if (candidate === correct) {
      candidate = niceColones(correct + (f > 1 ? 1 : -1) * Math.max(100, correct * 0.12));
    }
    if (candidate !== correct && candidate > 0) options.add(candidate);
  }

  // Fallback offsets if we still need more unique options
  let bump = 1;
  while (options.size < 4) {
    const offset = niceColones(correct * (0.1 * bump));
    const up = niceColones(correct + offset);
    const down = niceColones(correct - offset);
    if (up !== correct && up > 0) options.add(up);
    if (options.size >= 4) break;
    if (down !== correct && down > 0) options.add(down);
    bump++;
    if (bump > 40) {
      options.add(correct + bump * 100);
    }
  }

  const list = [...options].slice(0, 4);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
  return list;
}

export function shuffleProductIds(): number[] {
  const ids = PRODUCTOS.map((p) => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = tmp;
  }
  return ids;
}

/** Kahoot-style: full points at t=0, half at the deadline; wrong = 0. */
export const MAX_ROUND_POINTS = 1000;

export function speedPoints(
  correct: boolean,
  elapsedMs: number,
  durationMs: number,
): number {
  if (!correct) return 0;
  const duration = Math.max(1000, durationMs);
  const ratio = Math.min(1, Math.max(0, elapsedMs / duration));
  return Math.max(0, Math.round(MAX_ROUND_POINTS * (1 - ratio / 2)));
}

export const TIMER_CHOICES = [15, 20, 25, 30] as const;
export const DEFAULT_TIMER_SECONDS = 20;
