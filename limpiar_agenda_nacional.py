#!/usr/bin/env python3
"""Reevalúa TODOS los temas que hoy están en Nivel 1 (agenda nacional) contra el
criterio real y único: 5+ notas repartidas en 2+ días distintos. Cualquiera que haya
escalado antes con el criterio viejo y más flojo (ej. 6+ menciones en un solo día) se
baja a Nivel 3 -- nunca se borra el tema ni sus notas, solo se corrige su nivel.

No toca temas creados/editados a mano (tipo distinto de 'completo' con origen
'informativo' no aplica aquí) -- solo revisa los que el ROBOT escaló automáticamente.

Uso: python3 limpiar_agenda_nacional.py
"""
import csv

RUTA_TEMAS = 'data/temas.csv'
RUTA_EVENTOS = 'data/eventos.csv'


def limpiar():
    with open(RUTA_TEMAS, encoding='utf-8-sig') as f:
        temas = list(csv.DictReader(f))
    with open(RUTA_EVENTOS, encoding='utf-8-sig') as f:
        eventos = list(csv.DictReader(f))

    bajados = []
    for t in temas:
        if t.get('nivel_relevancia') != '1':
            continue
        if not t['id'].startswith('auto-'):
            continue  # temas curados a mano nunca se tocan aquí, sin importar su criterio de origen
        evs_del_tema = [e for e in eventos if e['tema_id'] == t['id']]
        dias_distintos = len({e['fecha'] for e in evs_del_tema})
        cumple = len(evs_del_tema) >= 5 and dias_distintos >= 2
        if not cumple:
            t['nivel_relevancia'] = '3'
            bajados.append((t['id'], t.get('nombre', t['id']), len(evs_del_tema), dias_distintos))

    if bajados:
        campos = list(temas[0].keys())
        with open(RUTA_TEMAS, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas:
                w.writerow(t)

    print(f'Temas bajados de Nivel 1 a Nivel 3 (no cumplían el criterio real): {len(bajados)}')
    for tid, nombre, n_notas, n_dias in bajados:
        print(f'  - {tid} ("{nombre[:60]}") -- {n_notas} notas en {n_dias} día(s)')


if __name__ == '__main__':
    limpiar()
