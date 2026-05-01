#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "prisma" / "schema.prisma"
DOCS = ROOT / "docs"
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
VERSION_LABEL = f"v{VERSION}"
ER_PNG = DOCS / f"squash-manager-er-{VERSION_LABEL}.png"
PDF = DOCS / f"squash-manager-functional-summary-{VERSION_LABEL}.pdf"
DOT_FILE = DOCS / f"squash-manager-er-{VERSION_LABEL}.dot"


@dataclass
class Field:
    name: str
    type_name: str
    raw: str


@dataclass
class Model:
    name: str
    table: str
    fields: list[Field] = field(default_factory=list)


def git_commit() -> str:
    return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()


def clean_type(type_name: str) -> str:
    return type_name.rstrip("?[]")


def parse_schema() -> dict[str, Model]:
    text = SCHEMA.read_text(encoding="utf-8")
    models: dict[str, Model] = {}
    for match in re.finditer(r"model\s+(\w+)\s+\{(.*?)\n\}", text, re.S):
      name, body = match.group(1), match.group(2)
      table_match = re.search(r'@@map\("([^"]+)"\)', body)
      model = Model(name=name, table=table_match.group(1) if table_match else name)
      for raw_line in body.splitlines():
          line = raw_line.strip()
          if not line or line.startswith("@@") or line.startswith("//"):
              continue
          parts = line.split()
          if len(parts) < 2:
              continue
          model.fields.append(Field(name=parts[0], type_name=parts[1], raw=line))
      models[name] = model
    return models


def field_label(field: Field, models: dict[str, Model]) -> str:
    marker = ""
    if "@id" in field.raw:
        marker = "PK "
    elif "@unique" in field.raw:
        marker = "UQ "
    elif "@relation" in field.raw:
        marker = "FK "
    type_name = field.type_name.replace("[]", "*")
    return f"{marker}{field.name}: {type_name}"


def dot_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def relation_edges(models: dict[str, Model]) -> set[tuple[str, str, str]]:
    edges: set[tuple[str, str, str]] = set()
    for model in models.values():
        scalar_fields = {field.name for field in model.fields}
        for field in model.fields:
            target = clean_type(field.type_name)
            if target in models and "@relation" in field.raw:
                relation = re.search(r"fields:\s*\[([^\]]+)\]", field.raw)
                label = relation.group(1).replace(" ", "") if relation else field.name
                edges.add((model.name, target, label))

        for field in model.fields:
            if field.type_name.rstrip("?") != "String" or not field.name.endswith("Id"):
                continue
            base = field.name[:-2]
            candidates = [
                base[0].upper() + base[1:],
                re.sub(r"^(home|away|winner|walkoverBy|retiredBy|venue|host|managed|actor)", "", base),
            ]
            for candidate in candidates:
                normalized = candidate[0].upper() + candidate[1:] if candidate else ""
                if normalized in models and field.name in scalar_fields:
                    edges.add((model.name, normalized, field.name))
                    break
    return edges


def generate_er_png() -> None:
    models = parse_schema()
    lines = [
        "digraph ERD {",
        "  graph [rankdir=LR, bgcolor=\"white\", pad=\"0.25\", nodesep=\"0.55\", ranksep=\"0.9\"];",
        "  node [shape=plain, fontname=\"Arial\"];",
        "  edge [fontname=\"Arial\", fontsize=9, color=\"#52616b\", arrowsize=0.7];",
    ]

    for model in models.values():
        rows = [
            f'<TR><TD BGCOLOR="#0b2f3a"><FONT COLOR="white"><B>{dot_escape(model.name)}</B></FONT><BR/><FONT POINT-SIZE="9" COLOR="white">{dot_escape(model.table)}</FONT></TD></TR>'
        ]
        for field in model.fields:
            type_clean = clean_type(field.type_name)
            if type_clean in models and "[]" in field.type_name:
                continue
            rows.append(f'<TR><TD ALIGN="LEFT">{dot_escape(field_label(field, models))}</TD></TR>')
        label = f'<<TABLE BORDER="1" CELLBORDER="1" CELLPADDING="5" COLOR="#d0d7de">{"".join(rows)}</TABLE>>'
        lines.append(f'  {model.name} [label={label}];')

    for source, target, label in sorted(relation_edges(models)):
        lines.append(f'  {source} -> {target} [label="{dot_escape(label)}"];')

    lines.append("}")
    DOCS.mkdir(exist_ok=True)
    DOT_FILE.write_text("\n".join(lines), encoding="utf-8")
    subprocess.run(["dot", "-Tpng", str(DOT_FILE), "-o", str(ER_PNG)], cwd=ROOT, check=True)


FEATURES = {
    "ca": {
        "language": "Català",
        "title": "Resum funcional de Squash League Manager",
        "toc": "Índex de temes",
        "intro": [
            "Aquest document descriu les funcionalitats presents a la versió actual de l'aplicació.",
            "La versió de referència és {version}, paquet npm {package_version}, commit {commit}, generada el {date}.",
        ],
        "sections": [
            ("Jugadors", [
                "Alta i edició de perfils amb email validat, nom, cognoms, foto, sexe, dades físiques opcionals, mà dominant, raqueta, telèfon i preferència d'idioma.",
                "Control de privacitat per ocultar dades de contacte o físiques.",
                "Canvi de contrasenya per al jugador autenticat i gestió de contrasenyes per part d'un admin.",
                "Fitxa pública amb clubs, equips, estadístiques, gràfic donut de victòries/derrotes, punts de rànquing, evolució de rànquing i últims partits jugats.",
                "Els jugadors sense club es mostren com a Independents.",
            ]),
            ("Clubs", [
                "Llistat agrupat per comunitat autònoma, amb escut, adreça, ciutat i edició condicionada per permisos.",
                "Fitxa de club amb escut, província, ciutat, codi postal, pistes disponibles, web, manager i mapa de detall.",
                "Mapa general amb marcadors reals basats en latitud/longitud; si no hi ha coordenades fiables, el mapa no es mostra.",
                "Històric de jugadors per temporada i conservació de noms històrics quan un club canvia de nom.",
                "Managers limitats al seu club; admins poden crear i modificar tots els clubs.",
            ]),
            ("Equips", [
                "Equips per club, temporada i categoria, amb ordre de jugadors dins de l'equip.",
                "Fitxa d'equip, edició de detalls i redirecció a la fitxa després de guardar.",
                "Els canvis de nom d'equip o club es reflecteixen a les fitxes dels jugadors durant la temporada actual.",
            ]),
            ("Lligues", [
                "Lligues individuals i per equips independents, amb temporades, categories, dates d'inscripció, inici i fi.",
                "Les lligues poden estar limitades a un sol club.",
                "Jornades amb finestra de dates d'inici i fi, calendaris per categoria i vista compacta agrupada per jornada.",
                "Classificacions d'individuals i equips, incloent l'evolució gràfica de posicions jornada a jornada.",
                "Resultats al millor de 3 o 5 sets, entrada per selectors, WO/BYE i resultats parcials.",
            ]),
            ("Tornejos", [
                "Creació per managers o admins amb títol, descripció, club seu, jutge àrbitre, cartell, categories, restriccions d'edat/sexe i format al millor de 3 o 5.",
                "Inscripció per jugadors, managers o admins, amb llistats per categoria i etiquetes de caps de sèrie.",
                "Selecció de caps de sèrie manual o per rànquing i generació de quadre principal, consolació i partit de tercer lloc.",
                "Visualització gràfica del quadre amb avenç de guanyadors i resultats disponibles.",
                "Tornejos puntuables per rànquings CAT, RFES, PSA i comunitats autònomes, amb banderes/logos.",
            ]),
            ("Rànquings i estadístiques", [
                "Rànquings generals per tipus de torneig puntuable; només es mostren seccions amb resultats.",
                "Càlcul per punts vigents fins a la següent edició del torneig i mitjana amb divisor mínim 2.",
                "Columnes actuals: posició, jugador, punts, tornejos, mitjana i G, on G vol dir guanyats.",
                "Fitxa de jugador amb temporades jugades, millor rànquing, tornejos jugats, partits, finals i tornejos guanyats.",
            ]),
            ("Rols i seguretat", [
                "Lectura pública sense login per consultar la major part de l'aplicació.",
                "Rol jugador: pot editar el seu perfil, inscriure's a tornejos i informar resultats propis de lliga quan correspon.",
                "Rol manager: administra el seu club, equips i tornejos del club.",
                "Rol admin: pot modificar jugadors, clubs, equips, lligues, tornejos i contrasenyes.",
                "Contrasenyes amb hash bcrypt, sessions amb tokens hash i dades d'auditoria en taules principals.",
            ]),
            ("Internacionalització i UI", [
                "Interfície en català, castellà i anglès, amb selector per banderes i preferència en cookie.",
                "Avís de política de cookies per poder guardar preferències al navegador.",
                "Interfícies adaptades a mòbil, botons flotants de tornar a dalt i listats resumits.",
            ]),
            ("Dades, històric i desplegament", [
                "Base de dades PostgreSQL gestionada amb Flyway i migracions versionades.",
                "Històric per temporades, noms històrics de clubs/equips i snapshots de classificacions.",
                "Desplegament a Google Cloud Run i Cloud SQL dins del projecte squash-league-ivan.",
                "Repositori GitHub amb tags de versió i snapshots manuals de base de dades quan cal preservar dades.",
            ]),
        ],
    },
    "es": {
        "language": "Español",
        "title": "Resumen funcional de Squash League Manager",
        "toc": "Índice de temas",
        "intro": [
            "Este documento describe las funcionalidades presentes en la versión actual de la aplicación.",
            "La versión de referencia es {version}, paquete npm {package_version}, commit {commit}, generada el {date}.",
        ],
        "sections": [
            ("Jugadores", [
                "Alta y edición de perfiles con email validado, nombre, apellidos, foto, sexo, datos físicos opcionales, mano dominante, raqueta, teléfono e idioma preferido.",
                "Control de privacidad para ocultar datos de contacto o físicos.",
                "Cambio de contraseña para el jugador autenticado y gestión de contraseñas por parte de un admin.",
                "Ficha pública con clubes, equipos, estadísticas, gráfico donut de victorias/derrotas, puntos de ránking, evolución de ránking y últimos partidos jugados.",
                "Los jugadores sin club se muestran como Independientes.",
            ]),
            ("Clubes", [
                "Listado agrupado por comunidad autónoma, con escudo, dirección, ciudad y edición condicionada por permisos.",
                "Ficha de club con escudo, provincia, ciudad, código postal, pistas disponibles, web, manager y mapa de detalle.",
                "Mapa general con marcadores reales basados en latitud/longitud; si no hay coordenadas fiables, el mapa no se muestra.",
                "Histórico de jugadores por temporada y conservación de nombres históricos cuando un club cambia de nombre.",
                "Managers limitados a su club; admins pueden crear y modificar todos los clubes.",
            ]),
            ("Equipos", [
                "Equipos por club, temporada y categoría, con orden de jugadores dentro del equipo.",
                "Ficha de equipo, edición de detalles y redirección a la ficha después de guardar.",
                "Los cambios de nombre de equipo o club se reflejan en las fichas de los jugadores durante la temporada actual.",
            ]),
            ("Ligas", [
                "Ligas individuales y por equipos independientes, con temporadas, categorías, fechas de inscripción, inicio y fin.",
                "Las ligas pueden estar limitadas a un único club.",
                "Jornadas con ventana de fechas de inicio y fin, calendarios por categoría y vista compacta agrupada por jornada.",
                "Clasificaciones individuales y por equipos, incluyendo evolución gráfica de posiciones jornada a jornada.",
                "Resultados al mejor de 3 o 5 sets, entrada mediante selectores, WO/BYE y resultados parciales.",
            ]),
            ("Torneos", [
                "Creación por managers o admins con título, descripción, club sede, juez árbitro, cartel, categorías, restricciones de edad/sexo y formato al mejor de 3 o 5.",
                "Inscripción por jugadores, managers o admins, con listados por categoría y etiquetas de cabezas de serie.",
                "Selección de cabezas de serie manual o por ránking y generación de cuadro principal, consolación y tercer puesto.",
                "Visualización gráfica del cuadro con avance de ganadores y resultados disponibles.",
                "Torneos puntuables para ránkings CAT, RFES, PSA y comunidades autónomas, con banderas/logos.",
            ]),
            ("Ránkings y estadísticas", [
                "Ránkings generales por tipo de torneo puntuable; solo se muestran secciones con resultados.",
                "Cálculo por puntos vigentes hasta la siguiente edición del torneo y promedio con divisor mínimo 2.",
                "Columnas actuales: posición, jugador, puntos, torneos, promedio y G, donde G significa ganados.",
                "Ficha de jugador con temporadas jugadas, mejor ránking, torneos jugados, partidos, finales y torneos ganados.",
            ]),
            ("Roles y seguridad", [
                "Lectura pública sin login para consultar la mayor parte de la aplicación.",
                "Rol jugador: puede editar su perfil, inscribirse en torneos e informar resultados propios de liga cuando corresponde.",
                "Rol manager: administra su club, equipos y torneos del club.",
                "Rol admin: puede modificar jugadores, clubes, equipos, ligas, torneos y contraseñas.",
                "Contraseñas con hash bcrypt, sesiones con tokens hash y datos de auditoría en tablas principales.",
            ]),
            ("Internacionalización y UI", [
                "Interfaz en catalán, español e inglés, con selector por banderas y preferencia guardada en cookie.",
                "Aviso de política de cookies para poder guardar preferencias en el navegador.",
                "Interfaces adaptadas a móvil, botones flotantes de volver arriba y listados resumidos.",
            ]),
            ("Datos, histórico y despliegue", [
                "Base de datos PostgreSQL gestionada con Flyway y migraciones versionadas.",
                "Histórico por temporadas, nombres históricos de clubes/equipos y snapshots de clasificaciones.",
                "Despliegue en Google Cloud Run y Cloud SQL dentro del proyecto squash-league-ivan.",
                "Repositorio GitHub con tags de versión y snapshots manuales de base de datos cuando hace falta preservar datos.",
            ]),
        ],
    },
    "en": {
        "language": "English",
        "title": "Squash League Manager Functional Summary",
        "toc": "Table of contents",
        "intro": [
            "This document describes the functionality present in the current application version.",
            "Reference version: {version}, npm package {package_version}, commit {commit}, generated on {date}.",
        ],
        "sections": [
            ("Players", [
                "Create and edit profiles with verified email, name, photo, gender, optional physical data, dominant hand, racket brand, phone and preferred language.",
                "Privacy controls for contact and physical information.",
                "Password changes for authenticated players and password management by admins.",
                "Public profile with clubs, teams, statistics, win/loss donut chart, ranking points, ranking evolution and latest played matches.",
                "Players without a club are shown as Independent.",
            ]),
            ("Clubs", [
                "Directory grouped by autonomous community, with crest, address, city and permission-based edit actions.",
                "Club detail page with crest, province, city, postal code, available courts, website, manager and detail map.",
                "General map with real markers based on latitude/longitude; if reliable coordinates are missing, the map is not shown.",
                "Player history by season and preservation of historical names when a club is renamed.",
                "Managers are limited to their club; admins can create and edit all clubs.",
            ]),
            ("Teams", [
                "Teams by club, season and category, including player order within the team.",
                "Team detail, edit flow and redirect back to detail after saving.",
                "Team or club name changes are reflected in player profiles during the current season.",
            ]),
            ("Leagues", [
                "Independent individual and team leagues, with seasons, categories, registration dates, start and end dates.",
                "Leagues can be restricted to a single club.",
                "Matchdays have start/end date windows, calendars by category and compact grouped matchday views.",
                "Individual and team standings, including charted standings evolution matchday by matchday.",
                "Best-of-3 or best-of-5 results, selector-based set entry, WO/BYE and partial scores.",
            ]),
            ("Tournaments", [
                "Creation by managers or admins with title, description, host club, referee, poster, categories, age/gender restrictions and best-of-3 or best-of-5 format.",
                "Registration by players, managers or admins, with category lists and seeded-player labels.",
                "Manual or ranking-based seed selection and generation of main draw, consolation draw and third-place match.",
                "Graphical bracket view with winners advancing and available results displayed.",
                "Tournaments can score for CAT, RFES, PSA and autonomous-community rankings, with flags/logos.",
            ]),
            ("Rankings and statistics", [
                "General rankings by scoreable tournament type; only rankings with results are shown.",
                "Active points remain until the next edition of the tournament and averages use a minimum divisor of 2.",
                "Current columns: position, player, points, tournaments, average and G, where G means wins.",
                "Player page includes seasons played, best ranking, tournaments played, matches, finals and tournaments won.",
            ]),
            ("Roles and security", [
                "Public read-only access for most application data without login.",
                "Player role: edit own profile, register for tournaments and enter own league results where allowed.",
                "Manager role: administer own club, club teams and club tournaments.",
                "Admin role: edit players, clubs, teams, leagues, tournaments and passwords.",
                "Passwords use bcrypt hashes, sessions use hashed tokens, and core tables carry audit data.",
            ]),
            ("Internationalization and UI", [
                "Catalan, Spanish and English UI, flag-based selector and cookie-stored preference.",
                "Cookie policy prompt before storing browser preferences.",
                "Mobile-friendly screens, floating back-to-top buttons and summarized lists.",
            ]),
            ("Data, history and deployment", [
                "PostgreSQL database managed through Flyway versioned migrations.",
                "Season history, historical club/team names and ranking snapshots.",
                "Deployment on Google Cloud Run and Cloud SQL in the squash-league-ivan project.",
                "GitHub repository with version tags and manual database snapshots when data must be preserved.",
            ]),
        ],
    },
}


def register_fonts() -> tuple[str, str]:
    regular = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
    bold = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    if regular.exists():
        pdfmetrics.registerFont(TTFont("DocFont", str(regular)))
        if bold.exists():
            pdfmetrics.registerFont(TTFont("DocFontBold", str(bold)))
            return "DocFont", "DocFontBold"
        return "DocFont", "DocFont"
    return "Helvetica", "Helvetica-Bold"


def build_pdf() -> None:
    font, bold_font = register_fonts()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("DocTitle", parent=styles["Title"], fontName=bold_font, fontSize=22, leading=28, textColor=colors.HexColor("#0b2f3a"), alignment=TA_CENTER))
    styles.add(ParagraphStyle("DocH1", parent=styles["Heading1"], fontName=bold_font, fontSize=17, leading=22, textColor=colors.HexColor("#0b2f3a"), spaceBefore=16, spaceAfter=8))
    styles.add(ParagraphStyle("DocH2", parent=styles["Heading2"], fontName=bold_font, fontSize=13, leading=17, textColor=colors.HexColor("#ef5a3c"), spaceBefore=10, spaceAfter=5))
    styles.add(ParagraphStyle("DocBody", parent=styles["BodyText"], fontName=font, fontSize=9.5, leading=13))
    styles.add(ParagraphStyle("DocSmall", parent=styles["BodyText"], fontName=font, fontSize=8, leading=10, textColor=colors.HexColor("#52616b")))

    doc = SimpleDocTemplate(str(PDF), pagesize=A4, rightMargin=1.6 * cm, leftMargin=1.6 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    story = []
    commit = git_commit()
    generated = date.today().isoformat()

    story.append(Paragraph("Squash League Manager", styles["DocTitle"]))
    story.append(Paragraph(f"Functional documentation / Documentació funcional / Documentación funcional", styles["DocBody"]))
    story.append(Spacer(1, 0.25 * cm))
    meta_rows = [
        ["Version", VERSION_LABEL],
        ["NPM package", VERSION],
        ["Commit", commit],
        ["Generated", generated],
        ["Repository", "ivanmolera/squash-league-manager"],
    ]
    meta = Table(meta_rows, colWidths=[4 * cm, 11 * cm])
    meta.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font),
        ("FONTNAME", (0, 0), (0, -1), bold_font),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2f7")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d0d7de")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(meta)
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("Database entity-relationship diagram is included as a separate PNG artifact in this repository.", styles["DocSmall"]))

    for lang in ("ca", "es", "en"):
        data = FEATURES[lang]
        story.append(PageBreak())
        story.append(Paragraph(f"{data['title']} ({data['language']})", styles["DocH1"]))
        for text in data["intro"]:
            story.append(Paragraph(text.format(version=VERSION_LABEL, package_version=VERSION, commit=commit, date=generated), styles["DocBody"]))
            story.append(Spacer(1, 0.1 * cm))

        story.append(Paragraph(data["toc"], styles["DocH2"]))
        for index, (section, _) in enumerate(data["sections"], start=1):
            story.append(Paragraph(f"{index}. {section}", styles["DocBody"]))

        for index, (section, items) in enumerate(data["sections"], start=1):
            story.append(Paragraph(f"{index}. {section}", styles["DocH2"]))
            for item in items:
                story.append(Paragraph(f"• {item}", styles["DocBody"]))

    story.append(PageBreak())
    story.append(Paragraph("Appendix / Annex / Anexo", styles["DocH1"]))
    story.append(Paragraph(f"Entity-relationship diagram: {ER_PNG.name}", styles["DocBody"]))
    if ER_PNG.exists():
        story.append(Spacer(1, 0.25 * cm))
        story.append(Image(str(ER_PNG), width=17 * cm, height=10 * cm, kind="proportional"))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont(font, 8)
        canvas.setFillColor(colors.HexColor("#52616b"))
        canvas.drawString(1.6 * cm, 0.9 * cm, f"Squash League Manager {VERSION_LABEL}")
        canvas.drawRightString(A4[0] - 1.6 * cm, 0.9 * cm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> None:
    DOCS.mkdir(exist_ok=True)
    generate_er_png()
    build_pdf()
    print(ER_PNG)
    print(PDF)


if __name__ == "__main__":
    main()
