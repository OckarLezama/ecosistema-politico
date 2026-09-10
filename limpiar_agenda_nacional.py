#!/usr/bin/env python3
"""Reevalúa TODOS los temas que hoy están en Nivel 1 (agenda nacional) contra el
criterio real y completo:
- 5+ notas repartidas en 2+ días distintos (excluyendo columnas de opinión del conteo)
- Y al menos 1 actor de alto perfil real (nivel_influencia >= 7) vinculado

Sin el segundo requisito, cosas como resultados de lotería o columnas de opinión
diarias escalaban solo por repetirse seguido, sin ser agenda nacional real.

No borra ningún tema ni nota, solo corrige el nivel. No toca temas curados a mano
(solo revisa los que empiezan con "auto-", que son los que el robot escala solo).

Uso: python3 limpiar_agenda_nacional.py
"""
import csv

RUTA_TEMAS = 'data/temas.csv'
RUTA_EVENTOS = 'data/eventos.csv'
RUTA_ACTORES = 'data/actores.csv'


def cargar_actores_alta_influencia():
    with open(RUTA_ACTORES, encoding='utf-8-sig') as f:
        actores = list(csv.DictReader(f))
    return [a for a in actores if a.get('nivel_influencia') and int(a['nivel_influencia']) >= 7]


def noCuentaParaEscalar(descripcion):
    """Mismo criterio que el robot -- columnas de opinión y declaraciones RUTINARIAS de
    mañanera (sin el 🔔 de alerta) nunca cuentan para escalar, sin importar cuántas veces
    se repitan. La presidenta siempre es la actora en su propia mañanera, así que el
    filtro de actor de alto perfil no discrimina nada ahí sin esto."""
    if descripcion.startswith('[Opinión]'):
        return True
    if descripcion.startswith('[Mañanera]') and '🔔' not in descripcion:
        return True
    return False


def mencionaActorAlto(texto, actores_altos):
    texto = texto.lower()
    return any(
        any(p.lower() in texto for p in a['nombre'].split() if len(p) > 3)
        for a in actores_altos
    )


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
        dias_distintos = len({e['fecha'] for e in evs_del_tema})
        tiene_actor_alto = any(mencionaActorAlto(e['descripcion'], actores_altos) for e in evs_del_tema)

        cumple = len(evs_del_tema) >= 4 and dias_distintos >= 2 and tiene_actor_alto
        if not cumple:
            razon = []
            if len(evs_del_tema) < 4: razon.append(f'{len(evs_del_tema)} notas (necesita 4+)')
            if dias_distintos < 2: razon.append(f'{dias_distintos} día(s) (necesita 2+)')
            if not tiene_actor_alto: razon.append('sin actor de alto perfil vinculado')
            t['nivel_relevancia'] = '3'
            bajados.append((t['id'], t.get('nombre', t['id']), ', '.join(razon)))

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
