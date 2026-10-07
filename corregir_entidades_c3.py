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
from entidades_c3 import validar_entidad, es_dominio_local

try:
    from robot_buscar_temas import ACTORES_C3, variantes_actor_c3
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
        ok = validar_entidad(ent, ev.get('descripcion', ''), es_dominio_local(ev.get('fuente_url')), vars_por_ent.get(ent, []))
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

if __name__ == '__main__':
    main()
