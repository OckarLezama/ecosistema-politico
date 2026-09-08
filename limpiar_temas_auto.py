#!/usr/bin/env python3
"""
Limpieza ÚNICA -- baja de vuelta a nivel_relevancia=3 (informativo) los temas
'auto-' que subieron a "agenda nacional" (nivel_relevancia=1) con el criterio
VIEJO de escalar_temas_informativos() / escalar_a_agenda_nacional_si_aplica()
(3+ notas O 2+ actores de alta influencia contando a Sheinbaum sola) -- ese
criterio era demasiado fácil de alcanzar, y llenó la agenda nacional de
cientos de temas genéricos que saturaron la matriz de Agenda y Coyuntura.

Este script NO toca ningún tema que NO empiece con 'auto-' (los temas reales,
curados a mano en temas.csv, nunca se tocan). Solo re-evalúa los 'auto-' con
el criterio NUEVO y corregido (5+ notas, O 2+ actores de alta influencia sin
contar a Sheinbaum) -- los que ya cumplen ese criterio más estricto se quedan
en nivel 1 porque sí tienen cobertura real; el resto baja a nivel 3.

Cómo correrlo (una sola vez, después de subir el robot corregido):
    python3 limpiar_temas_auto.py
"""
import csv

RUTA_TEMAS = 'data/temas.csv'
RUTA_EVENTOS = 'data/eventos.csv'
RUTA_ACTORES = 'data/actores.csv'


def cargar_actores_alta_influencia():
    with open(RUTA_ACTORES, encoding='utf-8') as f:
        actores = list(csv.DictReader(f))
    return [a for a in actores if a.get('nivel_influencia') and int(a['nivel_influencia']) >= 7]


def limpiar():
    with open(RUTA_TEMAS, encoding='utf-8') as f:
        temas = list(csv.DictReader(f))
    with open(RUTA_EVENTOS, encoding='utf-8') as f:
        eventos = list(csv.DictReader(f))
    actores_altos = cargar_actores_alta_influencia()

    campos = list(temas[0].keys())
    bajados, mantenidos = 0, 0

    for t in temas:
        if not t['id'].startswith('auto-'):
            continue  # nunca se toca un tema real curado a mano
        if t.get('nivel_relevancia') != '1':
            continue  # ya no está en agenda nacional, nada que corregir aquí

        evs_del_tema = [e for e in eventos if e['tema_id'] == t['id']]

        # criterio DEFINITIVO -- se quitó por completo el atajo de "2+ actores de alta
        # influencia" (un solo titular mencionando a 2 funcionarios ya no basta) --
        # ahora el único criterio es 5+ notas repartidas en 2+ días distintos
        dias_distintos_del_tema = len({e['fecha'] for e in evs_del_tema})
        cumple_criterio_nuevo = len(evs_del_tema) >= 5 and dias_distintos_del_tema >= 2
        dias_distintos_del_tema = len({e['fecha'] for e in evs_del_tema})
        cumple_criterio_nuevo = len(evs_del_tema) >= 5 and dias_distintos_del_tema >= 2
        if cumple_criterio_nuevo:
            mantenidos += 1
        else:
            t['nivel_relevancia'] = '3'
            t['tipo'] = 'informativo'
            bajados += 1

    with open(RUTA_TEMAS, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for t in temas:
            w.writerow(t)

    print(f'{bajados} tema(s) "auto-" bajados de agenda nacional a informativo (no cumplían el criterio corregido).')
    print(f'{mantenidos} tema(s) "auto-" se quedaron en agenda nacional (sí cumplen el criterio corregido -- cobertura real).')
    print('Los temas reales (sin prefijo "auto-") nunca se tocaron.')


if __name__ == '__main__':
    limpiar()
