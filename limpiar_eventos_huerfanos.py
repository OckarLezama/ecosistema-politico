#!/usr/bin/env python3
"""Archiva los eventos cuyo tema ya no existe (temas automáticos fusionados o borrados).

Estos eventos no aparecen en Agenda, Timeline ni Genealogía (todo eso cuenta por tema) pero
inflaban el total y ensuciaban las pruebas (16% de huérfanos el 2026-10-06).
- Se archivan en data/eventos_archivo.csv (no se borran) y salen de data/eventos.csv.
- Se conservan en eventos.csv los que tienen entidad_c3: Estados los usa directo, sin tema.
- Solo se archivan eventos de más de 7 días, para no tocar lo que el robot acaba de crear.
- Las URLs archivadas siguen contando como "ya procesadas" en el robot de temas.
Uso: python3 limpiar_eventos_huerfanos.py   (idempotente)
"""
import csv
from datetime import datetime, timedelta, timezone

RUTA_EV, RUTA_TEMAS, RUTA_ARCH = 'data/eventos.csv', 'data/temas.csv', 'data/eventos_archivo.csv'
ZONA_MX = timezone(timedelta(hours=-6))

def main():
    with open(RUTA_TEMAS, encoding='utf-8-sig', newline='') as f:
        ids = {t['id'] for t in csv.DictReader(f)}
    with open(RUTA_EV, encoding='utf-8-sig', newline='') as f:
        rd = csv.DictReader(f)
        campos = rd.fieldnames
        eventos = list(rd)
    lim = (datetime.now(ZONA_MX) - timedelta(days=7)).strftime('%Y-%m-%d')
    arch, mant = [], []
    for e in eventos:
        if e['tema_id'] not in ids and not e.get('entidad_c3') and (e.get('fecha') or '') < lim:
            arch.append(e)
        else:
            mant.append(e)
    if not arch:
        print('Huérfanos por archivar: 0')
        return
    try:
        with open(RUTA_ARCH, encoding='utf-8-sig', newline='') as f:
            ya = {r['id'] for r in csv.DictReader(f)}
        existe = True
    except FileNotFoundError:
        ya, existe = set(), False
    nuevos = [e for e in arch if e['id'] not in ya]
    with open(RUTA_ARCH, 'a' if existe else 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        if not existe:
            w.writeheader()
        w.writerows(nuevos)
    with open(RUTA_EV, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(mant)
    print(f'Huérfanos archivados: {len(arch)} (quedan en eventos.csv: {len(mant)})')

if __name__ == '__main__':
    main()
