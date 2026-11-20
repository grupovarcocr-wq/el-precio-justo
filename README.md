# El Precio Justo

Juego tipo *Kahoot / The Price is Right* para el **Té de Leandro Vargas Corao**. El host proyecta en la TV; los invitados juegan desde el celular. Precios en colones costarricenses (₡).

## Cómo jugar el día del evento

1. **Host (TV / laptop):** abrí `/host`, proyectá a pantalla completa. Se crea una sala con código y QR. Elegí el tiempo por ronda (15–30 s).
2. **Invitados:** abrí `/jugar` (o escaneá el QR), escribí el código y tu nombre.
3. Cuando haya jugadores, el host pulsa **Empezar**. En la TV sale el producto y el cronómetro; en el celular aparecen **4 opciones de precio**.
4. Al acertar, sumás más puntos si respondiste más rápido. Incorrecto = 0. Al acabar el tiempo (o si el host revela), se muestra el precio real y los puntos.
5. El host avanza al siguiente producto (orden aleatorio cada partida) hasta el ranking final.

## Catálogo de productos

Los precios salen solo de `src/lib/productos.json` (no inventar precios). Para agregar un producto:

1. Sumá una entrada con `id` único, `nombre`, `precio` real en ₡.
2. Poné imágenes en `public/productos/` (`producto-NN.jpeg`, `precio-NN.jpeg`). Si aún no hay foto, reutilizá un placeholder existente — la UI no bloquea.

## Desarrollo local

```bash
npm install
npm run dev
```

Abrí [http://127.0.0.1:3000](http://127.0.0.1:3000).
