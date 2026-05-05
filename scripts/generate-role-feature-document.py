#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
VERSION_LABEL = f"v{VERSION}"
PDF = DOCS / f"squashflow-role-feature-summary-{VERSION_LABEL}.pdf"


CONTENT = {
    "ca": {
        "language": "Català",
        "title": "SquashFlow: funcionalitats per rols i mòduls",
        "intro": [
            "Document funcional de referència per a la versió {version}.",
            "Aquest document resumeix què pot fer cada tipus d'usuari i com funcionen els mòduls principals de l'aplicació.",
        ],
        "roles": [
            ("Jugador", [
                "Pot registrar-se amb email i contrasenya, validar l'email i iniciar sessió.",
                "Pot editar la seva fitxa personal: nom, cognoms, foto, sexe, mà dominant, alçada, pes, raqueta, telèfon, idioma i preferències de privacitat.",
                "Pot canviar la seva contrasenya des de la fitxa personal.",
                "Pot sol·licitar unir-se a un club des de la seva fitxa. De moment només pot pertànyer a un club per temporada.",
                "Pot inscriure's a tornejos oberts si compleix les restriccions de categoria.",
                "Pot introduir o modificar resultats dels seus partits de lliga quan la funcionalitat està activa.",
            ]),
            ("Responsable de club", [
                "Pot modificar les dades del club que administra i gestionar-ne l'escut, dades de contacte, pistes i dies de tancament.",
                "Rep per email les sol·licituds de jugadors que volen unir-se al club.",
                "Pot acceptar o rebutjar sol·licituds d'alta al club. En acceptar, el jugador queda vinculat al club en la temporada activa.",
                "Pot gestionar equips del seu club i l'ordre dels jugadors dins de l'equip.",
                "Pot crear i editar tornejos organitzats pel seu club, gestionar inscripcions, caps de sèrie, quadres i resultats.",
            ]),
            ("Administrador", [
                "Pot administrar tots els jugadors, usuaris, clubs, equips, lligues, tornejos i rànquings.",
                "Pot canviar rols, suspendre comptes, reactivar usuaris i modificar contrasenyes de jugadors.",
                "Pot revisar sol·licituds de vinculació entre comptes d'usuari i fitxes esportives existents.",
                "Pot detectar i fusionar fitxes de jugador duplicades conservant l'històric esportiu.",
                "Pot activar o desactivar mòduls mitjançant feature toggles.",
            ]),
        ],
        "modules": [
            ("Gestió de lligues", [
                "Lligues individuals i per equips, independents entre elles.",
                "Categories configurables i possibilitat de restringir una lliga a un sol club.",
                "Calendari amb jornades i finestres de dates d'inici i fi.",
                "Partits al millor de 3 o 5 sets, resultats parcials guiats, WO i calendari agrupat per categoria/jornada.",
                "Classificacions amb dades actualitzades y evolució gràfica de posicions per jornada.",
            ]),
            ("Gestió de tornejos", [
                "Creació de tornejos per responsables o admins amb club seu, cartell, jutge àrbitre, dates i categories.",
                "Categories amb restriccions d'edat i sexe.",
                "Inscripció de jugadors, selecció manual o automàtica de caps de sèrie i generació de quadres.",
                "Quadre principal, consolació per perdedors de primera ronda i partit pel tercer lloc.",
                "Visualització gràfica del quadre amb avenç dels guanyadors i resultats.",
            ]),
            ("Rànquings", [
                "Rànquings generals basats en tornejos puntuables.",
                "Suport per CAT, RFES, PSA i comunitats autònomes mitjançant codis i banderes/logos.",
                "Càlcul per punts vigents fins a la següent edició del torneig i mitjana amb divisor mínim 2.",
                "Els rànquings ajuden a suggerir caps de sèrie en tornejos.",
            ]),
            ("Identitat i duplicats", [
                "Separació entre User, compte d'accés, i Player, identitat esportiva.",
                "El registre detecta fitxes existents similars i crea una sol·licitud de vinculació en lloc de duplicar perfils.",
                "Els admins poden fusionar duplicats movent clubs, equips, partits, tornejos, rànquings i reserves al perfil principal.",
            ]),
        ],
    },
    "es": {
        "language": "Español",
        "title": "SquashFlow: funcionalidades por roles y módulos",
        "intro": [
            "Documento funcional de referencia para la versión {version}.",
            "Este documento resume qué puede hacer cada tipo de usuario y cómo funcionan los módulos principales de la aplicación.",
        ],
        "roles": [
            ("Jugador", [
                "Puede registrarse con email y contraseña, validar el email e iniciar sesión.",
                "Puede editar su ficha personal: nombre, apellidos, foto, sexo, mano dominante, altura, peso, raqueta, teléfono, idioma y privacidad.",
                "Puede cambiar su contraseña desde la ficha personal.",
                "Puede solicitar unirse a un club desde su ficha. Por ahora solo puede pertenecer a un club por temporada.",
                "Puede inscribirse en torneos abiertos si cumple las restricciones de categoría.",
                "Puede introducir o modificar resultados de sus partidos de liga cuando la funcionalidad está activa.",
            ]),
            ("Responsable de club", [
                "Puede modificar los datos del club que administra y gestionar escudo, contacto, pistas y días de cierre.",
                "Recibe por email las solicitudes de jugadores que quieren unirse al club.",
                "Puede aceptar o rechazar solicitudes de alta en el club. Al aceptar, el jugador queda vinculado al club en la temporada activa.",
                "Puede gestionar equipos de su club y el orden de jugadores dentro del equipo.",
                "Puede crear y editar torneos organizados por su club, gestionar inscripciones, cabezas de serie, cuadros y resultados.",
            ]),
            ("Administrador", [
                "Puede administrar todos los jugadores, usuarios, clubes, equipos, ligas, torneos y ránquings.",
                "Puede cambiar roles, suspender cuentas, reactivar usuarios y modificar contraseñas de jugadores.",
                "Puede revisar solicitudes de vinculación entre cuentas de usuario y fichas deportivas existentes.",
                "Puede detectar y fusionar fichas de jugador duplicadas conservando el histórico deportivo.",
                "Puede activar o desactivar módulos mediante feature toggles.",
            ]),
        ],
        "modules": [
            ("Gestión de ligas", [
                "Ligas individuales y por equipos, independientes entre sí.",
                "Categorías configurables y posibilidad de restringir una liga a un solo club.",
                "Calendario con jornadas y ventanas de fecha de inicio y fin.",
                "Partidos al mejor de 3 o 5 sets, resultados parciales guiados, WO y calendario agrupado por categoría/jornada.",
                "Clasificaciones actualizadas y evolución gráfica de posiciones por jornada.",
            ]),
            ("Gestión de torneos", [
                "Creación de torneos por responsables o admins con club sede, cartel, juez árbitro, fechas y categorías.",
                "Categorías con restricciones de edad y sexo.",
                "Inscripción de jugadores, selección manual o automática de cabezas de serie y generación de cuadros.",
                "Cuadro principal, consolación para perdedores de primera ronda y partido por el tercer puesto.",
                "Visualización gráfica del cuadro con avance de ganadores y resultados.",
            ]),
            ("Ránquings", [
                "Ránquings generales basados en torneos puntuables.",
                "Soporte para CAT, RFES, PSA y comunidades autónomas mediante códigos y banderas/logos.",
                "Cálculo por puntos vigentes hasta la siguiente edición del torneo y promedio con divisor mínimo 2.",
                "Los ránquings ayudan a sugerir cabezas de serie en torneos.",
            ]),
            ("Identidad y duplicados", [
                "Separación entre User, cuenta de acceso, y Player, identidad deportiva.",
                "El registro detecta fichas existentes similares y crea una solicitud de vinculación en lugar de duplicar perfiles.",
                "Los admins pueden fusionar duplicados moviendo clubes, equipos, partidos, torneos, ránquings y reservas al perfil principal.",
            ]),
        ],
    },
    "en": {
        "language": "English",
        "title": "SquashFlow: role and module capabilities",
        "intro": [
            "Functional reference document for version {version}.",
            "This document summarizes what each user role can do and how the main application modules work.",
        ],
        "roles": [
            ("Player", [
                "Can register with email and password, verify email and sign in.",
                "Can edit their personal profile: name, photo, gender, dominant hand, height, weight, racket, phone, language and privacy.",
                "Can change their password from the personal profile.",
                "Can request to join a club from their profile. For now, a player can belong to only one club per season.",
                "Can register for open tournaments when category restrictions are met.",
                "Can enter or edit their own league match results when the feature is enabled.",
            ]),
            ("Club responsible person", [
                "Can edit the managed club and maintain crest, contact details, courts and closed days.",
                "Receives email requests from players who want to join the club.",
                "Can accept or reject club join requests. Accepted players are linked to the club for the active season.",
                "Can manage club teams and player order within each team.",
                "Can create and edit tournaments hosted by the club, including registrations, seeds, draws and results.",
            ]),
            ("Admin", [
                "Can manage all players, users, clubs, teams, leagues, tournaments and rankings.",
                "Can change roles, suspend accounts, reactivate users and update player passwords.",
                "Can review link requests between user accounts and existing sporting profiles.",
                "Can detect and merge duplicate player profiles while preserving sporting history.",
                "Can enable or disable modules through feature toggles.",
            ]),
        ],
        "modules": [
            ("League management", [
                "Individual and team leagues are independent.",
                "Configurable categories and option to restrict a league to one club.",
                "Schedule with matchdays and start/end date windows.",
                "Best of 3 or 5 sets, guided set score entry, WO and category/matchday grouped calendar.",
                "Updated standings and graphical rank evolution by matchday.",
            ]),
            ("Tournament management", [
                "Tournament creation by responsible users or admins with host club, poster, referee, dates and categories.",
                "Categories with age and gender restrictions.",
                "Player registration, manual or ranking-based seed selection and draw generation.",
                "Main draw, consolation draw for first-round losers and third-place match.",
                "Graphical draw visualization with winner progression and results.",
            ]),
            ("Rankings", [
                "General rankings based on scoreable tournaments.",
                "Support for CAT, RFES, PSA and autonomous community ranking codes with flags/logos.",
                "Points remain valid until the next edition and ranking average uses minimum divisor 2.",
                "Rankings help suggest tournament seeds.",
            ]),
            ("Identity and duplicates", [
                "Separation between User, the access account, and Player, the sporting identity.",
                "Registration detects similar existing profiles and creates a link request instead of duplicating profiles.",
                "Admins can merge duplicates by moving clubs, teams, matches, tournaments, rankings and bookings to the primary profile.",
            ]),
        ],
    },
}


def styles():
    sample = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=sample["Title"], fontName="Helvetica-Bold", fontSize=22, leading=27, textColor=colors.HexColor("#0b2f3a"), spaceAfter=16),
        "h1": ParagraphStyle("H1", parent=sample["Heading1"], fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#0b2f3a"), spaceBefore=14, spaceAfter=8),
        "h2": ParagraphStyle("H2", parent=sample["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#0f766e"), spaceBefore=8, spaceAfter=4),
        "body": ParagraphStyle("Body", parent=sample["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13, spaceAfter=5),
        "small": ParagraphStyle("Small", parent=sample["BodyText"], fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor("#64748b")),
    }


def bullet_table(items: list[str], style: ParagraphStyle) -> Table:
    table = Table([["•", Paragraph(item, style)] for item in items], colWidths=[0.35 * cm, 16.2 * cm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#0f766e")),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))
    return table


def build_pdf() -> None:
    DOCS.mkdir(exist_ok=True)
    doc = SimpleDocTemplate(str(PDF), pagesize=A4, rightMargin=1.5 * cm, leftMargin=1.5 * cm, topMargin=1.4 * cm, bottomMargin=1.4 * cm)
    s = styles()
    story = []
    generated = date.today().isoformat()

    for index, data in enumerate(CONTENT.values()):
        if index:
            story.append(PageBreak())
        story.append(Paragraph(data["title"], s["title"]))
        story.append(Paragraph(f"{data['language']} · {VERSION_LABEL} · {generated}", s["small"]))
        story.append(Spacer(1, 0.25 * cm))
        for text in data["intro"]:
            story.append(Paragraph(text.format(version=VERSION_LABEL), s["body"]))

        story.append(Paragraph("1. Usuarios y roles / Usuaris i rols / Users and roles", s["h1"]))
        for heading, items in data["roles"]:
            story.append(Paragraph(heading, s["h2"]))
            story.append(bullet_table(items, s["body"]))

        story.append(Paragraph("2. Ligas, torneos y ránquings / Lligues, tornejos i rànquings / Leagues, tournaments and rankings", s["h1"]))
        for heading, items in data["modules"]:
            story.append(Paragraph(heading, s["h2"]))
            story.append(bullet_table(items, s["body"]))

    doc.build(story)
    print(PDF)


if __name__ == "__main__":
    build_pdf()
