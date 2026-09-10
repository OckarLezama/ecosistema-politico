#!/usr/bin/env python3
"""Reevalúa TODOS los temas que hoy están en Nivel 1 (agenda nacional) con el criterio
de 2 etapas (ver detalle en cada función), y además RELLENA actores vinculados para
temas que ya estaban en Nivel 1 desde antes de que existiera el clasificador automático
(por eso "Gusano Barrenador" y otros aparecían sin ningún actor asociado).

Uso: python3 limpiar_agenda_nacional.py
"""
import csv
import re
import urllib.parse
from datetime import datetime, timezone, timedelta

RUTA_TEMAS = 'data/temas.csv'
RUTA_EVENTOS = 'data/eventos.csv'
RUTA_ACTORES = 'data/actores.csv'
RUTA_TEMA_ACTORES = 'data/tema_actores.csv'
ZONA_MX = timezone(timedelta(hours=-6))


def cargar_actores_alta_influencia():
    with open(RUTA_ACTORES, encoding='utf-8-sig') as f:
        actores = list(csv.DictReader(f))
    return [a for a in actores if a.get('nivel_influencia') and int(a['nivel_influencia']) >= 7]


def noCuentaParaEscalar(descripcion):
    if descripcion.startswith('[Opinión]'):
        return True
    if descripcion.startswith('[Mañanera]') and '🔔' not in descripcion:
        return True
    return False


def calificaAgendaNacional(evs_del_tema, actores_altos, hoy_str):
    if not evs_del_tema:
        return False, 'sin notas'

    dias_distintos = len({e['fecha'] for e in evs_del_tema if e['fecha'] != hoy_str})
    if dias_distintos < 3:
        return False, f'{dias_distintos} día(s) antes de hoy (necesita 3+, hoy no cuenta)'

    dominios = set()
    for e in evs_del_tema:
        try:
            dominios.add(urllib.parse.urlparse(e.get('fuente_url','')).netloc)
        except Exception:
            pass
    dominios.discard('')
    if len(dominios) < 3:
        return False, f'{len(dominios)} medio(s) distinto(s) (necesita 3+) -- probablemente la misma fuente repetida'

    actores_mencionados = set()
    for e in evs_del_tema:
        texto = e['descripcion'].lower()
        for a in actores_altos:
            if any(p.lower() in texto for p in a['nombre'].split() if len(p) > 3):
                actores_mencionados.add(a['id'])

    intensidad_prom = sum(float(e.get('intensidad') or 0) for e in evs_del_tema) / len(evs_del_tema)

    puntos = len(dominios) - 3
    if intensidad_prom >= 7: puntos += 2
    if len(actores_mencionados) >= 2: puntos += 2

    if puntos >= 3:
        return True, f'{puntos} puntos ({len(dominios)} medios, intensidad {intensidad_prom:.1f}, {len(actores_mencionados)} actor(es))'
    return False, f'solo {puntos} puntos (necesita 3+) -- {len(dominios)} medios, intensidad {intensidad_prom:.1f}, {len(actores_mencionados)} actor(es)'


PALABRAS_SENALADO = ['acusa', 'acusan', 'acusado', 'investigación', 'investigado',
    'denuncia', 'implicado', 'señalado', 'sospecha', 'presunto', 'vinculado al caso',
    'carpeta de investigación', 'orden de aprehensión']
PALABRAS_REACCION = ['critica', 'critican', 'rechaza', 'rechazan', 'cuestiona',
    'cuestionan', 'responde', 'reacciona', 'exige', 'condena', 'pide investigación',
    'exigen', 'demandan']
PALABRAS_RED_EMPRESARIAL = ['empresa', 'empresario', 'contrato', 'licitación', 'negocio']
PALABRAS_CARGO_INSTITUCIONAL = ['secretario', 'secretaria', 'titular', 'director',
    'gobernador', 'gobernadora', 'presidenta', 'presidente', 'fiscal', 'alcalde',
    'alcaldesa', 'ministro', 'ministra']

def clasificarRolActorEnTema(texto_completo, actor):
    if any(p in texto_completo for p in PALABRAS_SENALADO):
        return 'Investigado'
    if any(p in texto_completo for p in PALABRAS_REACCION):
        grupo = (actor.get('grupo') or '').lower()
        if any(p in grupo for p in ['pan', 'pri', 'mc', 'movimiento ciudadano', 'oposición']):
            return 'Reacción de oposición'
        if 'morena' in grupo:
            return 'Reacción del gobierno'
        return 'Reacción social/mediática'
    if any(p in texto_completo for p in PALABRAS_RED_EMPRESARIAL):
        return 'Red empresarial'
    cargo = (actor.get('cargo') or '').lower()
    if any(p in cargo for p in PALABRAS_CARGO_INSTITUCIONAL) or any(p in texto_completo for p in PALABRAS_CARGO_INSTITUCIONAL):
        return 'Responsable institucional'
    return 'Mencionado'


def actoresParaTema(tema_id, evs_del_tema, actores, ya_existentes):
    nuevas_filas = []
    for actor in actores:
        if (tema_id, actor['id']) in ya_existentes:
            continue
        fragmentos_de_este_actor = []
        for e in evs_del_tema:
            clausulas = re.split(r'[;.]| pero | mientras ', e['descripcion'])
            for clausula in clausulas:
                clausula_lower = clausula.lower()
                if any(p.lower() in clausula_lower for p in actor['nombre'].split() if len(p) > 3):
                    fragmentos_de_este_actor.append(clausula_lower)
        if not fragmentos_de_este_actor:
            continue
        rol = clasificarRolActorEnTema(' '.join(fragmentos_de_este_actor), actor)
        nuevas_filas.append({'tema_id': tema_id, 'actor_id': actor['id'], 'rol': rol, 'detalle': ''})
    return nuevas_filas


def limpiar():
    with open(RUTA_TEMAS, encoding='utf-8-sig') as f:
        temas = list(csv.DictReader(f))
    with open(RUTA_EVENTOS, encoding='utf-8-sig') as f:
        eventos = list(csv.DictReader(f))
    actores_altos = cargar_actores_alta_influencia()
    with open(RUTA_ACTORES, encoding='utf-8-sig') as f:
        todos_los_actores = list(csv.DictReader(f))
    try:
        with open(RUTA_TEMA_ACTORES, encoding='utf-8-sig') as f:
            ya_existentes = {(r['tema_id'], r['actor_id']) for r in csv.DictReader(f)}
    except FileNotFoundError:
        ya_existentes = set()

    hoy_str = datetime.now(ZONA_MX).date().strftime('%Y-%m-%d')
    bajados = []
    filas_actores_nuevas = []

    for t in temas:
        if t.get('nivel_relevancia') != '1':
            continue
        if not t['id'].startswith('auto-'):
            continue

        evs_del_tema = [e for e in eventos if e['tema_id'] == t['id'] and not noCuentaParaEscalar(e['descripcion'])]
        cumple, razon = calificaAgendaNacional(evs_del_tema, actores_altos, hoy_str)
        if not cumple:
            t['nivel_relevancia'] = '3'
            bajados.append((t['id'], t.get('nombre', t['id']), razon))
        else:
            # sigue calificando -- si no tiene actores vinculados todavía (temas viejos,
            # de antes del clasificador automático), se rellenan aquí
            tiene_actores = any(tid==t['id'] for tid,_ in ya_existentes)
            if not tiene_actores:
                nuevas = actoresParaTema(t['id'], evs_del_tema, todos_los_actores, ya_existentes)
                filas_actores_nuevas.extend(nuevas)
                for fila in nuevas:
                    ya_existentes.add((fila['tema_id'], fila['actor_id']))

    if bajados:
        campos = list(temas[0].keys())
        with open(RUTA_TEMAS, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas:
                w.writerow(t)

    if filas_actores_nuevas:
        campos_ta = ['tema_id', 'actor_id', 'rol', 'detalle']
        try:
            with open(RUTA_TEMA_ACTORES, encoding='utf-8-sig'):
                existe = True
        except FileNotFoundError:
            existe = False
        with open(RUTA_TEMA_ACTORES, 'a', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=campos_ta, quoting=csv.QUOTE_MINIMAL)
            if not existe:
                w.writeheader()
            for fila in filas_actores_nuevas:
                w.writerow(fila)

    print(f'Temas bajados de Nivel 1 a Nivel 3 (no cumplían el criterio real): {len(bajados)}')
    for tid, nombre, razon in bajados:
        print(f'  - {tid} ("{nombre[:60]}") -- {razon}')
    print(f'\nActores rellenados en temas viejos que no tenían ninguno: {len(filas_actores_nuevas)}')


if __name__ == '__main__':
    limpiar()
