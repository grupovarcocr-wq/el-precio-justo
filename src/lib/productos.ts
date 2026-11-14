import catalog from "./productos.json";

export type Producto = {
  id: number;
  nombre: string;
  precio: number;
  imagenProducto: string;
  imagenPrecio: string;
};

export const PRODUCTOS = catalog as Producto[];

export function getProducto(index: number): Producto | null {
  if (index < 0 || index >= PRODUCTOS.length) return null;
  return PRODUCTOS[index];
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
