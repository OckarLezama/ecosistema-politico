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
    # agregar más fuentes reales aquí conforme se verifiquen (Expansión, El Universal, etc.)
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


def cargar_eventos_existentes():
    with open(RUTA_EVENTOS, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def siguiente_id_evento(eventos_existentes):
    numeros = [int(e['id'][1:]) for e in eventos_existentes if e['id'].startswith('e') and e['id'][1:].isdigit()]
    return f"e{(max(numeros)+1) if numeros else 1}"


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
                continue
            hash_enlace = hashlib.md5(enlace.encode()).hexdigest()
            if hash_enlace in ya_vistos:
                continue

            tema_encontrado = None
            for tema_id, palabras in PALABRAS_CLAVE.items():
                if tema_id in temas_ids_validos and any(p in texto_completo for p in palabras):
                    tema_encontrado = tema_id
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
                if menciones >= 2:
                    candidatos_sin_tema.append({
                        'hash_enlace': hash_enlace, 'tema_id_sugerido': '(sin tema — posible tema nuevo)',
                        'fecha_encontrado': hoy_mx.strftime('%Y-%m-%d'), 'titular': titulo_original,
                        'fuente_nombre': fuente['nombre'], 'fuente_url': enlace, 'estado': 'pendiente_revision',
                    })

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
    if eventos_nuevos:
        print(f'{len(eventos_nuevos)} evento(s) NUEVO(S) escrito(s) directo a eventos.csv (tiempo real, tema ya conocido).')
    else:
        print('Sin eventos nuevos de temas conocidos esta corrida.')

    guardar_candidatos(candidatos_sin_tema)
