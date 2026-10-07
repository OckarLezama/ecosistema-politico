#!/usr/bin/env python3
"""Corrección retroactiva (idempotente, corre en cada ciclo del robot) de la asignación de
estado en data/eventos.csv, con la misma regla que ya usa el robot (entidades_c3.py).

- Revisa los eventos de los últimos 30 días que tengan entidad_c3.
- Si la asignación no se sostiene (sin evidencia local y, según el origen, nota nacional o
  de búsqueda genérica), se deja entidad_c3 vacía. La nota NO se borra: sigue en su tema y
  en Agenda/Timeline; solo deja de contar para el pulso de ese estado.
- Quita de data/menciones_actores_c3.csv las menciones ligadas a esos eventos.
Uso: python3 corregir_entidades_c3.py
"""
import csv
import json
from datetime import datetime, timedelta, timezone
from entidades_c3 import validar_entidad, es_dominio_local, es_medio_local_titulo, mejor_entidad, quitar_medio, evidencia_por_estado

try:
    from robot_buscar_temas import (ACTORES_C3, variantes_actor_c3, sin_acentos, actoresYEntidadesMencionadosC3,
                                    clasificarSentimientoC3, guardarMencionesC3)
except Exception as e:  # sin feedparser, etc.
    print(f'No se pudo importar el robot de temas ({e}); no se corrige nada.')
    raise SystemExit(0)

RUTA_EV = 'data/eventos.csv'
RUTA_MEN = 'data/menciones_actores_c3.csv'
ZONA_MX = timezone(timedelta(hours=-6))

def main():
    with open(RUTA_EV, encoding='utf-8-sig', newline='') as f:
        rd = csv.DictReader(f)
        campos = rd.fieldnames
        eventos = list(rd)
    lim = (datetime.now(ZONA_MX) - timedelta(days=30)).strftime('%Y-%m-%d')
    vars_por_ent = {ent: [v for n, c, ap in lista for v in variantes_actor_c3(n, ap)] for ent, lista in ACTORES_C3.items()}
    limpiados = set()
    por_estado = {}
    for ev in eventos:
        ent = ev.get('entidad_c3') or ''
        if not ent or (ev.get('fecha') or '') < lim:
            continue
        ok = validar_entidad(ent, ev.get('descripcion', ''), es_dominio_local(ev.get('fuente_url')) or es_medio_local_titulo(ev.get('descripcion')), vars_por_ent.get(ent, []))
        if not ok:
            ev['entidad_c3'] = ''
            limpiados.add(ev['id'])
            por_estado[ent] = por_estado.get(ent, 0) + 1
    if limpiados:
        with open(RUTA_EV, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            w.writerows(eventos)
        try:
            with open(RUTA_MEN, encoding='utf-8-sig', newline='') as f:
                rd = csv.DictReader(f)
                cm = rd.fieldnames
                men = list(rd)
            mant = [m for m in men if m.get('evento_id') not in limpiados]
            with open(RUTA_MEN, 'w', encoding='utf-8', newline='') as f:
                w = csv.DictWriter(f, fieldnames=cm, quoting=csv.QUOTE_MINIMAL)
                w.writeheader()
                w.writerows(mant)
            print(f'  menciones retiradas: {len(men) - len(mant)}')
        except FileNotFoundError:
            pass
    print(f'Entidades corregidas: {len(limpiados)} eventos ({json.dumps(por_estado, ensure_ascii=False)})')
    asignar_faltantes(eventos, campos, vars_por_ent)


def asignar_faltantes(eventos, campos, vars_por_ent):
    """Segunda pasada: notas de los últimos 7 días SIN estado cuyo texto sí apunta a uno
    (localidad, gentilicio o actor definido). Caso real: "Asumen Eduardo Castillo y Carlos
    Evangelista circunscripciones de Morena" quedaba sin estado y "dos poblanos en las
    circunscripciones" se iba a Tabasco por nombrar a Adán Augusto. Usa la misma validación
    del robot y registra las menciones de actores como si la nota hubiera entrado bien."""
    lim = (datetime.now(ZONA_MX) - timedelta(days=7)).strftime('%Y-%m-%d')
    por_ent = {ent: [variantes_actor_c3(n, ap) for n, c, ap in lista] for ent, lista in ACTORES_C3.items()}
    nuevos = []
    for ev in eventos:
        if ev.get('entidad_c3') or (ev.get('fecha') or '') < lim:
            continue
        desc = ev.get('descripcion', '')
        medio_local = es_dominio_local(ev.get('fuente_url')) or es_medio_local_titulo(desc)
        texto = quitar_medio(desc)   # el nombre del medio no cuenta como evidencia del lugar
        ent = mejor_entidad(sin_acentos(texto.lower()), por_ent)
        if not ent:
            continue
        loc, act = evidencia_por_estado(sin_acentos(texto.lower()), por_ent)[ent]
        # conservador: localidad/gentilicio, o al menos 2 actores definidos del mismo estado
        # (un solo actor es ambiguo: "Andrés Manuel López Obrador" no es "López Beltrán")
        if loc < 1 and act < 2:
            continue
        if validar_entidad(ent, texto, medio_local, vars_por_ent.get(ent, [])):
            ev['entidad_c3'] = ent
            nuevos.append(ev)
    if not nuevos:
        print('Notas sin estado que ahora sí se asignan: 0')
        return
    with open(RUTA_EV, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(eventos)
    n_men = 0
    for ev in nuevos:
        texto = ev['descripcion'].lower()
        personas = {n for n, c, ap in ACTORES_C3.get(ev['entidad_c3'], [])}
        solo = [m for m in actoresYEntidadesMencionadosC3(texto, ev['entidad_c3']) if m in personas]
        if solo:
            guardarMencionesC3(ev['fecha'], ev['entidad_c3'], solo, clasificarSentimientoC3(texto), ev['id'],
                               ev.get('fuente_url', ''), ev.get('descripcion', ''))
            n_men += 1
    por_estado = {}
    for ev in nuevos:
        por_estado[ev['entidad_c3']] = por_estado.get(ev['entidad_c3'], 0) + 1
    print(f'Notas sin estado que ahora sí se asignan: {len(nuevos)} ({json.dumps(por_estado, ensure_ascii=False)}), menciones nuevas: {n_men}')

if __name__ == '__main__':
    main()
