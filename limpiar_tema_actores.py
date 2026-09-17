#!/usr/bin/env python3
"""Revisa CADA fila de tema_actores.csv contra el texto real de las notas de ese tema,
usando el mismo detector por cláusulas ya corregido. Si un actor no tiene evidencia real
en ninguna nota, se quita -- esto limpia entradas que quedaron mal desde antes de hoy
(el código solo agrega actores nuevos, nunca corrige lo viejo por sí solo).

Uso: python3 limpiar_tema_actores.py
"""
import csv, re

RUTA_EVENTOS = 'data/eventos.csv'
RUTA_TEMA_ACTORES = 'data/tema_actores.csv'
RUTA_ACTORES = 'data/actores.csv'
RUTA_TEMAS = 'data/temas.csv'


def _mencionadoDeFormaSegura(nombre_actor, clausula_lower):
    # misma corrección aplicada en robot_buscar_temas.py -- antes bastaba CUALQUIER
    # palabra suelta de 4+ letras del nombre completo, así que un apellido común (ej.
    # "Ávila") vinculaba al actor equivocado. Ahora se exige nombre completo, o al menos
    # 2 palabras consecutivas del nombre juntas.
    partes = [p for p in nombre_actor.split() if len(p) > 2]
    if len(partes) < 2:
        return partes and partes[0].lower() in clausula_lower
    combinaciones = [nombre_actor.lower(), f'{partes[0]} {partes[1]}'.lower()]
    if len(partes) >= 3:
        combinaciones.append(f'{partes[-2]} {partes[-1]}'.lower())
    return any(c in clausula_lower for c in combinaciones)


def tiene_evidencia_real(actor_nombre, evs_del_tema, resumen_tema):
    # revisa las notas Y el resumen curado del tema -- un actor puede estar conectado
    # legítimamente por el resumen (ej. "el gobierno de Trump revocó...") sin que su
    # nombre aparezca en cada nota individual. Sin esto, la limpieza podía borrar
    # conexiones reales por error (bug real encontrado al probar: Trump se quitaba
    # aunque sí es correcto que esté conectado a este tema).
    textos = [e['descripcion'] for e in evs_del_tema] + [resumen_tema or '']
    for texto in textos:
        clausulas = re.split(r'[;.]| pero | mientras ', texto)
        for clausula in clausulas:
            if _mencionadoDeFormaSegura(actor_nombre, clausula.lower()):
                return True
    return False



def limpiar():
    with open(RUTA_EVENTOS, encoding='utf-8-sig') as f:
        eventos = list(csv.DictReader(f))
    with open(RUTA_TEMA_ACTORES, encoding='utf-8-sig') as f:
        filas = list(csv.DictReader(f))
    with open(RUTA_ACTORES, encoding='utf-8-sig') as f:
        nombre_por_id = {a['id']: a['nombre'] for a in csv.DictReader(f)}
    with open(RUTA_TEMAS, encoding='utf-8-sig') as f:
        resumen_por_tema = {t['id']: t.get('resumen','') for t in csv.DictReader(f)}

    eventos_por_tema = {}
    for e in eventos:
        eventos_por_tema.setdefault(e['tema_id'], []).append(e)

    quitadas = []
    filas_buenas = []
    for fila in filas:
        nombre = nombre_por_id.get(fila['actor_id'], fila['actor_id'])
        evs = eventos_por_tema.get(fila['tema_id'], [])
        resumen = resumen_por_tema.get(fila['tema_id'], '')
        if tiene_evidencia_real(nombre, evs, resumen):
            filas_buenas.append(fila)
        else:
            quitadas.append((fila['tema_id'], nombre))

    if quitadas:
        campos = ['tema_id', 'actor_id', 'rol', 'detalle']
        with open(RUTA_TEMA_ACTORES, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for fila in filas_buenas:
                w.writerow(fila)

    print(f'Filas quitadas por no tener evidencia real en ninguna nota: {len(quitadas)}')
    for tema_id, nombre in quitadas:
        print(f'  - {tema_id}: {nombre}')


if __name__ == '__main__':
    limpiar()
