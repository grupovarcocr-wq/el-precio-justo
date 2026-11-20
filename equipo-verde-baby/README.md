# Equipo Verde Baby Edition

Party game multiplayer inspirado en **Verdes Siempre Ganan / El Equipo Verde Gana** (SD Games / Goliath), edición baby shower (Costa Rica).

Arquitectura y flujo (salas con código, host + jugadores, cronómetro, polling) basados en [el-precio-justo](https://github.com/grupovarcocr-wq/el-precio-justo).

## Cómo jugar

1. **Host:** abrí `/host` (o “Soy el host” en la landing). Se crea una sala con código y QR. Elegí el tiempo por ronda (15–30 s).
2. **Jugadores (3–12):** abrí `/jugar`, código + nombre.
3. Host pulsa **Empezar**. Cada ronda todos responden en secreto la misma carta.
4. Al cerrar el tiempo, el host puede **fusionar sinónimos** (texto libre) y luego **Puntuar**.
5. Coincide con la mayoría → Equipo Verde (+1 desde naranja, +2 si ya eras verde). El más rápido entre quienes acertaron suma **+1 de agilidad**.
6. 15 rondas: 5 cartas al azar de cada tipo (Completa la frase, Lo primero que viene a la mente, Esto o Aquello), barajadas.

## Reglas implementadas

- Mazo: 5 + 5 + 5 aleatorias, barajadas.
- Respuestas simultáneas y secretas.
- Ganadora = más popular (normalización: trim, minúsculas, sin acentos). Empates: todas las empatadas cuentan.
- Todos empiezan Naranja. Fallar → Naranja +0.
- Variante app: +1 agilidad al más rápido del grupo ganador (una vez por ronda).
- Host puede fusionar buckets de sinónimos antes de puntuar.

## Desarrollo

```bash
npm install
npm run dev
```

Abrí [http://127.0.0.1:3000](http://127.0.0.1:3000). Sin `DATABASE_URL` usa PGlite en memoria; con Postgres (p. ej. publish-app) corre las migraciones en `migrations/`.

## Créditos de assets

Ilustraciones baby (`leon-bebe.png`, `leandro-eco.jpg`, `invitacion-leandro.jpg`) reutilizadas del evento Té de Leandro Vargas Corao / el-precio-justo, con permiso del mismo equipo.

Las cartas en `src/lib/cartas.json` son contenido propio baby (no del juego comercial).

## Publicar el repo

Si el remoto aún no existe:

```bash
# Crear el repo vacío en GitHub (UI o gh), luego:
cd /path/to/equipo-verde-baby
git remote add origin https://github.com/grupovarcocr-wq/equipo-verde-baby.git
git push -u origin main
```
