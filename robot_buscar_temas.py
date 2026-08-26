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
from datetime import datetime, timezone

RUTA_TEMAS = 'data/temas.csv'
RUTA_CANDIDATOS = 'data/candidatos_revision.csv'

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


def buscar_candidatos():
    temas_ids_validos = {t['id'] for t in cargar_temas_nivel1()}
    ya_vistos = cargar_candidatos_existentes()
    candidatos = []

    for fuente in FUENTES_RSS:
        feed = feedparser.parse(fuente['url'])
        for entrada in feed.entries:
            titulo = (entrada.get('title') or '').lower()
            descripcion = (entrada.get('description') or '').lower()
            texto_completo = titulo + ' ' + descripcion
            enlace = entrada.get('link') or ''
            hash_enlace = hashlib.md5(enlace.encode()).hexdigest()
            if hash_enlace in ya_vistos:
                continue

            for tema_id, palabras in PALABRAS_CLAVE.items():
                if tema_id not in temas_ids_validos:
                    continue
                if any(palabra in texto_completo for palabra in palabras):
                    candidatos.append({
                        'hash_enlace': hash_enlace,
                        'tema_id_sugerido': tema_id,
                        'fecha_encontrado': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                        'titular': entrada.get('title', ''),
                        'fuente_nombre': fuente['nombre'],
                        'fuente_url': enlace,
                        'estado': 'pendiente_revision',
                    })
                    break  # un candidato solo se asocia a un tema, el primero que coincide

    return candidatos


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
    candidatos = buscar_candidatos()
    guardar_candidatos(candidatos)
