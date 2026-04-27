# Squash League Manager

Web app para gestionar ligas individuales, ligas por equipos, torneos, jugadores, clubes, resultados historicos y rankings de squash.

## Stack

- Next.js + TypeScript
- PostgreSQL en Cloud SQL
- Prisma como cliente tipado
- Flyway para versionar migraciones SQL
- Firebase Auth para login email/password
- Cloud Run para despliegue
- Cloud Storage para fotos de perfil y logos

## Desarrollo local

1. Copia `.env.example` a `.env`.
2. Configura `DATABASE_URL`, `FLYWAY_URL`, `FLYWAY_USER` y `FLYWAY_PASSWORD`.
3. Ejecuta las migraciones:

```bash
npm run db:migrate
```

4. Genera el cliente Prisma:

```bash
npm run prisma:generate
```

5. Arranca la app:

```bash
npm run dev
```

## Modelo de datos

La migracion inicial esta en `db/migrations/V1__initial_squash_domain.sql`.

El diseno conserva historico mediante:

- temporadas con estado `draft`, `active` o `closed`
- membresias jugador-club por temporada
- plantillas jugador-equipo por temporada/categoria
- datos redundantes del club/equipo en el momento de cada partido
- snapshots de clasificaciones al cerrar temporadas
- auditoria de cambios administrativos

Ver `docs/data-model.md` para el resumen del dominio.
