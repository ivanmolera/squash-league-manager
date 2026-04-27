# Modelo de datos inicial

## Objetivos

El modelo cubre ligas individuales, ligas por equipos y torneos de fin de semana. Esta preparado para conservar historico aunque los jugadores cambien de club o equipo entre temporadas.

## Historico

Los resultados no dependen del estado actual del jugador. Cada partido guarda:

- temporada
- competicion y categoria
- jugador local y visitante
- club/equipo de cada jugador en el momento del partido
- fecha/hora prevista y fecha/hora jugada
- sede, pista, estado, ganador y sets

Al cerrar una temporada se pueden guardar snapshots de rankings individuales y de equipos. Eso permite consultar clasificaciones antiguas exactamente como quedaron.

## Roles

Roles soportados:

- `admin`: administra todos los datos.
- `manager`: gestiona un club, sus equipos, plantillas y alineaciones.
- `player`: edita sus datos personales y solicita unirse a un club.

Cada club puede tener un unico manager.

## Competiciones

Tipos:

- `individual_league`
- `team_league`
- `tournament`

Cada competicion puede tener varias categorias. En torneos, cada categoria puede usar:

- `knockout`: eliminatoria directa con cabezas de serie y BYE.
- `round_robin`: liguilla simple para categorias con pocos jugadores.

## Reglas de partido

Un partido de squash se juega al mejor de 5 sets. Cada set valido exige:

- ganador con al menos 11 puntos
- diferencia minima de 2 puntos

Estados de partido:

- `scheduled`
- `played`
- `walkover`
- `bye`
- `cancelled`
- `retired`

Los WO cuentan como victoria/derrota, pero no generan puntos ficticios.

## Rankings

El ranking por equipos usa:

1. puntos totales por partidos individuales ganados
2. diferencia de puntos a favor/en contra
3. puntos a favor

El ranking individual inicial usa:

1. partidos ganados
2. porcentaje de victoria
3. diferencia de sets
4. diferencia de puntos
5. puntos a favor
