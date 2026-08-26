#!/usr/bin/env python3
"""
Robot de monitoreo — Fase 4, primer paso.

Qué hace: revisa fuentes RSS reales de medios mexicanos, busca coincidencias
con los temas Nivel 1 ya existentes en temas.csv, y las deja en
candidatos_revision.csv para que un humano las revise antes de que entren
a eventos.csv. NUNCA escribe directo a eventos.csv — ese es el punto:
proponer, no decidir solo.

Cómo correrlo: python3 robot_buscar_temas.py
Requiere: pip install feedparser --break-system-packages
"""
import csv
import feedparser
import hashlib
import urllib.request
import urllib.parse
import json
from datetime import datetime, timezone, timedelta

RUTA_TEMAS = 'data/temas.csv'
RUTA_EVENTOS = 'data/eventos.csv'
RUTA_ACTORES = 'data/actores.csv'
RUTA_CANDIDATOS = 'data/candidatos_revision.csv'
ZONA_MX = timezone(timedelta(hours=-6))


def cargar_actores_alta_influencia():
    """Lee actores.csv EN VIVO cada corrida — si mañana agregas más actores con
    nivel_influencia alto, el robot los usa solos, sin tocar este script de nuevo."""
    with open(RUTA_ACTORES, encoding='utf-8') as f:
        actores = list(csv.DictReader(f))
    return [a for a in actores if a.get('nivel_influencia') and int(a['nivel_influencia']) >= 8]


def calcular_intensidad(texto_completo, tema_id, eventos_existentes, actores_altos, apariciones_hoy):
    """Intensidad real (4-10), no fija — basada en señales objetivas, misma escala 1-10 ya definida."""
    intensidad = 4  # base: cobertura real confirmada (ya pasó el filtro de coincidencia)
    if apariciones_hoy >= 2:
        intensidad += 2  # cobertura cruzada: más de una nota del mismo tema hoy
    hace_3_dias = (datetime.now(ZONA_MX) - timedelta(days=3)).date()
    activo_reciente = any(datetime.strptime(e['fecha'], '%Y-%m-%d').date() >= hace_3_dias
                           for e in eventos_existentes if e['tema_id'] == tema_id)
    if activo_reciente:
        intensidad += 2  # ya lleva días en agenda, no es mención aislada
    if any(any(palabra.lower() in texto_completo for palabra in a['nombre'].split() if len(palabra) > 3)
           for a in actores_altos):
        intensidad += 1  # menciona a un actor de alta influencia
    return min(intensidad, 10)


# Fuentes RSS reales, verificadas manualmente antes de usarlas (no inventadas)
FUENTES_RSS = [
    {'nombre': 'El Informador', 'url': 'https://www.informador.mx/rss/mexico.xml'},
    {'nombre': 'La Jornada', 'url': 'https://www.jornada.com.mx/rss/politica.xml?v=1'},
]

# palabras clave por tema — se ajustan a mano, no se adivinan del nombre del tema solo
# (un nombre de tema como "Visa de Andy" es muy específico; "huachicol" es más genérico
# y aparece en más notas reales, por eso cada tema tiene su propia lista curada)
PALABRAS_CLAVE = {
    'huachicol-fiscal': ['huachicol fiscal', 'farías laguna', 'contrabando de combustible'],
    'visa-de-andy': ['andy lópez beltrán', 'visa de andy', 'andrés manuel lópez beltrán'],
    'visas-politicos-eeuu': ['revocación de visa', 'visa revocada', 'políticos mexicanos visa'],
    'tmec-revision': ['t-mec', 'tmec', 'revisión del tratado'],
    'rocha-moya-acusacion': ['rocha moya', 'rubén rocha'],
    'intervencion-militar-eeuu': ['intervención militar', 'trump méxico cárteles', 'ataque a cárteles'],
    'el-mencho': ['el mencho', 'oseguera cervantes'],
    'sinaloa-crisis': ['chapitos', 'guerra en sinaloa', 'violencia en sinaloa'],
}


def cargar_temas_nivel1():
    with open(RUTA_TEMAS, encoding='utf-8') as f:
        temas = list(csv.DictReader(f))
    return [t for t in temas if t.get('nivel_relevancia') == '1']


def cargar_candidatos_existentes():
    """evita proponer el mismo enlace dos veces en corridas distintas del robot"""
    try:
        with open(RUTA_CANDIDATOS, encoding='utf-8') as f:
            return {r['hash_enlace'] for r in csv.DictReader(f)}
    except FileNotFoundError:
        return set()


def consultar_gdelt(query_texto, minutos=90):
    """Consulta la API pública de GDELT (100k+ medios, filtrado a México) — sin llave,
    sin costo. Devuelve artículos reales de las últimas horas que mencionan el texto dado."""
    url = ('https://api.gdeltproject.org/api/v2/doc/doc?query='
           + urllib.parse.quote(f'"{query_texto}" sourcecountry:mexico')
           + f'&mode=artlist&maxrecords=15&lastminutes={minutos}&format=json')
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data.get('articles', [])
    except Exception as e:
        print(f'  GDELT: error consultando "{query_texto}": {e}')
        return []


def cargar_eventos_existentes():
    with open(RUTA_EVENTOS, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def siguiente_id_evento(eventos_existentes):
    numeros = [int(e['id'][1:]) for e in eventos_existentes if e['id'].startswith('e') and e['id'][1:].isdigit()]
    return f"e{(max(numeros)+1) if numeros else 1}"


CATEGORIA_KEYWORDS = {
    'Seguridad Nacional': ['cártel', 'narco', 'cjng', 'chapitos', 'homicidio', 'violencia', 'guardia nacional', 'fgr', 'sedena', 'marina'],
    'Relación Bilateral': ['trump', 'eeuu', 'estados unidos', 'washington', 'embajada', 'aranceles', 'visa', 'rubio'],
    'Economía': ['peso', 'inflación', 'pib', 'banxico', 'exportación', 'arancel', 't-mec', 'tmec'],
    'Social': ['periodista', 'derechos humanos', 'protesta', 'huelga'],
}

def clasificar_categoria(texto_completo):
    """Categoría real por palabras clave — la etiqueta <category> del feed es demasiado
    genérica ('México' siempre), no distingue nada útil."""
    for cat, palabras in CATEGORIA_KEYWORDS.items():
        if any(p in texto_completo for p in palabras):
            return cat
    return 'Gobernabilidad'  # respaldo: temas de gobierno/política interna por defecto


def cargar_temas_todos():
    with open(RUTA_TEMAS, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def crear_tema_informativo(titulo, fecha, categoria='Gobernabilidad'):
    """Crea un tema NUEVO automático cuando hay señal fuerte (2+ actores de alta influencia)
    pero no existe tema para eso. tipo=informativo, nivel_relevancia=3 — bajo perfil, visible
    en Feed/Timeline, pero NO se cuela como agenda nacional oficial sin revisión humana."""
    temas = cargar_temas_todos()
    campos = list(temas[0].keys()) if temas else []
    nuevo_id = 'auto-' + hashlib.md5((titulo+fecha).encode()).hexdigest()[:10]
    if any(t['id']==nuevo_id for t in temas):
        return nuevo_id
    nuevo = {c: '' for c in campos}
    nuevo.update({
        'id': nuevo_id, 'nombre': titulo[:80], 'categoria': categoria,
        'peso_politico': '5', 'horizonte': 'corto', 'resumen': titulo,
        'nivel_relevancia': '3', 'tipo': 'informativo', 'estado': 'activo',
    })
    with open(RUTA_TEMAS, 'a', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writerow(nuevo)
    return nuevo_id


def escalar_temas_informativos():
    """Un tema 'informativo' se vuelve Nivel 1 (agenda nacional) SOLO si acumula señal real por
    sí mismo — sin que nadie lo marque a mano. Criterio: 3+ eventos propios, o mencionan 2+
    actores de alta influencia en notas distintas."""
    temas = cargar_temas_todos()
    eventos = cargar_eventos_existentes()
    actores_altos = cargar_actores_alta_influencia()
    cambios = 0
    for t in temas:
        if t.get('tipo') != 'informativo':
            continue
        evs_del_tema = [e for e in eventos if e['tema_id'] == t['id']]
        if len(evs_del_tema) == 0:
            continue
        menciona_altos = set()
        for e in evs_del_tema:
            texto = e['descripcion'].lower()
            for a in actores_altos:
                if any(p.lower() in texto for p in a['nombre'].split() if len(p) > 3):
                    menciona_altos.add(a['id'])
        if len(evs_del_tema) >= 3 or len(menciona_altos) >= 2:
            t['tipo'] = 'completo'
            t['nivel_relevancia'] = '1'
            cambios += 1
    if cambios:
        campos = list(temas[0].keys())
        with open(RUTA_TEMAS, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas: w.writerow(t)
        print(f'{cambios} tema(s) escalado(s) automáticamente a agenda nacional (Nivel 1).')


def escalar_a_agenda_nacional_si_aplica(tema_id, conteo_hoy, eventos_existentes):
    """Sube un tema de informativo (nivel 3) a agenda nacional (nivel 1) SOLO con señal
    real y repetida: 3+ notas el mismo día, O ya lleva 2+ días distintos con eventos —
    cobertura real sostenida, no una nota aislada. Nunca escala con una sola mención."""
    temas = cargar_temas_todos()
    tema = next((t for t in temas if t['id']==tema_id), None)
    if not tema or tema.get('tipo') != 'informativo':
        return
    dias_distintos = len(set(e['fecha'] for e in eventos_existentes if e['tema_id']==tema_id))
    if conteo_hoy >= 3 or dias_distintos >= 2:
        campos = list(temas[0].keys())
        for t in temas:
            if t['id']==tema_id:
                t['nivel_relevancia'] = '1'
                t['tipo'] = 'completo'  # deja de ser "informativo ligero", ya se ganó el lugar
        with open(RUTA_TEMAS, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas: w.writerow(t)
        print(f'  -> Tema {tema_id} ESCALADO a agenda nacional (cobertura real confirmada).')


def guardar_evento_directo(evento):
    """Escribe DIRECTO a eventos.csv — solo para temas que YA existen en temas.csv.
    Es el camino automático de verdad: sin revisión manual, en tiempo real."""
    campos = ['id', 'tema_id', 'fecha', 'categoria', 'intensidad', 'descripcion', 'fuente_url']
    with open(RUTA_EVENTOS, 'a', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writerow(evento)


def buscar_candidatos():
    temas = cargar_temas_nivel1()
    temas_ids_validos = {t['id'] for t in temas}
    ya_vistos = cargar_candidatos_existentes()
    eventos_existentes = cargar_eventos_existentes()
    ya_procesados_eventos = {e['fuente_url'] for e in eventos_existentes}
    actores_altos = cargar_actores_alta_influencia()
    hoy_mx = datetime.now(ZONA_MX).date()

    candidatos_sin_tema = []
    eventos_nuevos = []
    conteo_hoy_por_tema = {}

    for fuente in FUENTES_RSS:
        feed = feedparser.parse(fuente['url'])
        for entrada in feed.entries:
            fecha_pub = entrada.get('published_parsed') or entrada.get('updated_parsed')
            if not fecha_pub:
                continue
            fecha_pub_dt = datetime(*fecha_pub[:6], tzinfo=timezone.utc).astimezone(ZONA_MX).date()
            if fecha_pub_dt != hoy_mx:
                continue

            titulo_original = entrada.get('title', '')
            texto_completo = (titulo_original + ' ' + (entrada.get('description') or '')).lower()
            enlace = entrada.get('link') or ''
            if enlace in ya_procesados_eventos:
                continue  # solo se descarta si YA está en eventos.csv de verdad
            hash_enlace = hashlib.md5(enlace.encode()).hexdigest()
            # "ya_vistos" (candidatos_revision.csv) ya NO bloquea aquí — eso dejaba fuera
            # para siempre notas que sí coinciden con un tema conocido, solo por haber
            # aparecido antes como candidato "sin tema" en una corrida vieja

            tema_encontrado = None
            for tema_id, palabras in PALABRAS_CLAVE.items():
                if tema_id in temas_ids_validos and any(p in texto_completo for p in palabras):
                    tema_encontrado = tema_id
                    break
            if not tema_encontrado:
                # respaldo automático: cualquier tema Nivel 1 SIN palabras clave curadas se
                # busca por su propio nombre — así un tema nuevo que agregues a temas.csv
                # ya se detecta solo, sin que nadie edite este script
                for t in temas:
                    if t['id'] not in PALABRAS_CLAVE and t['nombre'].lower() in texto_completo:
                        tema_encontrado = t['id']
                        break

            if tema_encontrado:
                conteo_hoy_por_tema[tema_encontrado] = conteo_hoy_por_tema.get(tema_encontrado, 0) + 1
                intensidad = calcular_intensidad(texto_completo, tema_encontrado, eventos_existentes,
                                                   actores_altos, conteo_hoy_por_tema[tema_encontrado])
                eventos_nuevos.append({
                    'tema_id': tema_encontrado, 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                    'categoria': next((t['categoria'] for t in temas if t['id']==tema_encontrado), ''),
                    'intensidad': intensidad, 'descripcion': titulo_original, 'fuente_url': enlace,
                })
            else:
                # sin tema conocido: si menciona 2+ actores de alta influencia, sí vale la pena
                # revisar aunque no sepamos a qué tema pertenece todavía (posible tema nuevo)
                menciones = sum(1 for a in actores_altos if a['nombre'].split()[-1].lower() in texto_completo)
                if menciones >= 2 and hash_enlace not in ya_vistos:
                    categoria_real = clasificar_categoria(texto_completo)
                    tema_auto = crear_tema_informativo(titulo_original, hoy_mx.strftime('%Y-%m-%d'), categoria_real)
                    eventos_nuevos.append({
                        'tema_id': tema_auto, 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                        'categoria': categoria_real, 'intensidad': 5,
                        'descripcion': titulo_original, 'fuente_url': enlace,
                    })

    # GDELT: consulta directa por cada tema Nivel 1, filtrado a México — no depende de
    # palabras clave ni de que una fuente RSS específica lo haya cubierto
    for tema in temas:
        # usar palabras clave curadas y cortas (lo que la gente/medios sí escribe), no el
        # nombre formal completo del tema — eso casi nunca aparece tal cual en un artículo real
        terminos_busqueda = PALABRAS_CLAVE.get(tema['id'], [tema['nombre']])
        articulos = []
        for termino in terminos_busqueda[:2]:  # máximo 2 consultas por tema, para no saturar la API
            articulos += consultar_gdelt(termino)
        for art in articulos:
            enlace = art.get('url', '')
            if not enlace or enlace in ya_procesados_eventos:
                continue
            hash_enlace = hashlib.md5(enlace.encode()).hexdigest()
            if hash_enlace in ya_vistos:
                continue
            titulo_original = art.get('title', '')
            texto_completo = titulo_original.lower()
            conteo_hoy_por_tema[tema['id']] = conteo_hoy_por_tema.get(tema['id'], 0) + 1
            intensidad = calcular_intensidad(texto_completo, tema['id'], eventos_existentes,
                                               actores_altos, conteo_hoy_por_tema[tema['id']])
            eventos_nuevos.append({
                'tema_id': tema['id'], 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                'categoria': tema.get('categoria', 'Gobernabilidad'), 'intensidad': intensidad,
                'descripcion': titulo_original, 'fuente_url': enlace,
            })
            ya_procesados_eventos.add(enlace)

    return eventos_nuevos, candidatos_sin_tema



def guardar_candidatos(nuevos):
    if not nuevos:
        print('Sin candidatos nuevos esta corrida.')
        return
    campos = ['hash_enlace', 'tema_id_sugerido', 'fecha_encontrado', 'titular', 'fuente_nombre', 'fuente_url', 'estado']
    existe = True
    try:
        open(RUTA_CANDIDATOS, encoding='utf-8').close()
    except FileNotFoundError:
        existe = False
    with open(RUTA_CANDIDATOS, 'a', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos)
        if not existe:
            w.writeheader()
        for c in nuevos:
            w.writerow(c)
    print(f'{len(nuevos)} candidato(s) nuevo(s) agregado(s) a {RUTA_CANDIDATOS} para revisión.')


if __name__ == '__main__':
    eventos_nuevos, candidatos_sin_tema = buscar_candidatos()

    for ev in eventos_nuevos:
        eventos_ya = cargar_eventos_existentes()
        ev['id'] = siguiente_id_evento(eventos_ya)
        guardar_evento_directo(ev)

    # tras escribir todo, revisar si algún tema informativo ya se ganó pasar a agenda nacional
    conteo_final = {}
    for ev in eventos_nuevos:
        conteo_final[ev['tema_id']] = conteo_final.get(ev['tema_id'], 0) + 1
    for tema_id, conteo in conteo_final.items():
        escalar_a_agenda_nacional_si_aplica(tema_id, conteo, cargar_eventos_existentes())

    if eventos_nuevos:
        print(f'{len(eventos_nuevos)} evento(s) NUEVO(S) escrito(s) directo a eventos.csv (tiempo real, tema ya conocido).')
    else:
        print('Sin eventos nuevos de temas conocidos esta corrida.')

    guardar_candidatos(candidatos_sin_tema)
    escalar_temas_informativos()
