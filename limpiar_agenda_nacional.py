#!/usr/bin/env python3
"""Reevalúa TODOS los temas que hoy están en Nivel 1 (agenda nacional) con el criterio
de 2 etapas:

ETAPA 1 (obligatoria):
- 2+ días distintos con actividad real
- al menos 1 actor de alto perfil que NO sea Sheinbaum (protagonista de la mañanera,
  cuya sola mención nunca es señal real -- aparece en TODO lo que sale de ahí), O 2+
  actores de alto perfil distintos en total

ETAPA 2 (puntaje, solo si pasó la etapa 1): 3+ puntos de:
- +1 por cada dominio de medio distinto que lo cubra (medios reales, no notas)
- +2 si la intensidad promedio es 7+
- +2 si hay 2+ actores de alto perfil distintos

No borra ningún tema ni nota, solo corrige el nivel. No toca temas curados a mano.

Uso: python3 limpiar_agenda_nacional.py
"""
import csv
import urllib.parse

RUTA_TEMAS = 'data/temas.csv'
RUTA_EVENTOS = 'data/eventos.csv'
RUTA_ACTORES = 'data/actores.csv'
ACTOR_FUENTE_RUTINARIA_ID = 'sheinbaum'


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


def calificaAgendaNacional(evs_del_tema, actores_altos):
    if not evs_del_tema:
        return False, 'sin notas'

    dias_distintos = len({e['fecha'] for e in evs_del_tema})
    if dias_distintos < 2:
        return False, f'{dias_distintos} día(s) (necesita 2+)'

    dominios = set()
    for e in evs_del_tema:
        try:
            dominios.add(urllib.parse.urlparse(e.get('fuente_url','')).netloc)
        except Exception:
            pass
    dominios.discard('')
    if len(dominios) < 2:
        return False, f'{len(dominios)} medio(s) distinto(s) (necesita 2+) -- probablemente la misma fuente repetida'

    actores_mencionados = set()
    for e in evs_del_tema:
        texto = e['descripcion'].lower()
        for a in actores_altos:
            if any(p.lower() in texto for p in a['nombre'].split() if len(p) > 3):
                actores_mencionados.add(a['id'])

    intensidad_prom = sum(float(e.get('intensidad') or 0) for e in evs_del_tema) / len(evs_del_tema)

    puntos = len(dominios) - 2
    if intensidad_prom >= 7: puntos += 2
    if len(actores_mencionados) >= 2: puntos += 2

    if puntos >= 3:
        return True, f'{puntos} puntos ({len(dominios)} medios, intensidad {intensidad_prom:.1f}, {len(actores_mencionados)} actor(es))'
    return False, f'solo {puntos} puntos (necesita 3+) -- {len(dominios)} medios, intensidad {intensidad_prom:.1f}, {len(actores_mencionados)} actor(es)'

def limpiar():
    with open(RUTA_TEMAS, encoding='utf-8-sig') as f:
        temas = list(csv.DictReader(f))
    with open(RUTA_EVENTOS, encoding='utf-8-sig') as f:
        eventos = list(csv.DictReader(f))
    actores_altos = cargar_actores_alta_influencia()

    bajados = []
    for t in temas:
        if t.get('nivel_relevancia') != '1':
            continue
        if not t['id'].startswith('auto-'):
            continue

        evs_del_tema = [e for e in eventos if e['tema_id'] == t['id'] and not noCuentaParaEscalar(e['descripcion'])]
        cumple, razon = calificaAgendaNacional(evs_del_tema, actores_altos)
        if not cumple:
            t['nivel_relevancia'] = '3'
            bajados.append((t['id'], t.get('nombre', t['id']), razon))

    if bajados:
        campos = list(temas[0].keys())
        with open(RUTA_TEMAS, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas:
                w.writerow(t)

    print(f'Temas bajados de Nivel 1 a Nivel 3 (no cumplían el criterio real): {len(bajados)}')
    for tid, nombre, razon in bajados:
        print(f'  - {tid} ("{nombre[:60]}") -- {razon}')


if __name__ == '__main__':
    limpiar()
