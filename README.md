# El Precio Justo

Juego tipo *The Price is Right* para el **Té de Leandro Vargas Corao**. El host proyecta en la TV; los invitados juegan desde el celular. Precios en colones costarricenses (₡).

## Cómo jugar el día del evento

1. **Host (TV / laptop):** abrí `/host`, proyectá a pantalla completa. Se crea una sala con código y QR.
2. **Invitados:** abrí `/jugar` (o escaneá el QR), escribí el código y tu nombre.
3. Cuando haya jugadores, el host pulsa **Empezar**. En la TV sale el producto; en el celular aparece el campo para adivinar el precio.
4. El host cierra apuestas y **revela**. Gana quien tenga la menor diferencia absoluta. Empates comparten el punto.
5. El host avanza al siguiente producto hasta el ranking final.

## Desarrollo local

```bash
npm install
npm run dev
```

Abrí [http://127.0.0.1:3000](http://127.0.0.1:3000).

Los precios salen solo de `src/lib/productos.json`.
