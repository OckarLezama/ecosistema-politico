#!/usr/bin/env python3
"""Diagnóstico de UN tema -- cuántas notas tiene por día, para saber si 73 notas es
cobertura real de muchos días o si se están colando duplicados del mismo día.
No modifica nada.

Uso: python3 diagnostico_tema.py huachicol-fiscal
"""
import csv, sys
from collections import Counter

RUTA_EVENTOS = 'data/eventos.csv'

def diagnosticar(tema_id):
    with open(RUTA_EVENTOS, encoding='utf-8') as f:
        eventos = [e for e in csv.DictReader(f) if e['tema_id']==tema_id]
    if not eventos:
        print(f'No hay eventos para "{tema_id}"')
        return
    por_dia = Counter(e['fecha'] for e in eventos)
    print(f'=== {tema_id} -- {len(eventos)} notas totales, en {len(por_dia)} días distintos ===')
    for fecha, n in sorted(por_dia.items()):
        marca = '  <-- muchas en un solo día, revisar' if n>=6 else ''
        print(f'  {fecha}: {n} nota(s){marca}')
    print()
    print('Ejemplos de títulos del día con más notas, para revisar si son duplicados reales:')
    dia_top = por_dia.most_common(1)[0][0]
    for e in eventos:
        if e['fecha']==dia_top:
            print(f'  - {e["descripcion"][:100]}')

if __name__ == '__main__':
    tema_id = sys.argv[1] if len(sys.argv)>1 else 'huachicol-fiscal'
    diagnosticar(tema_id)
