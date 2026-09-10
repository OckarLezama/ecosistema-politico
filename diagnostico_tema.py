#!/usr/bin/env python3
"""Diagnóstico de un tema específico -- cuenta notas por día, para confirmar si un
volumen alto es cobertura real repartida en varios días, o duplicados amontonados en
pocos. Uso: python3 diagnostico_tema.py <tema_id>"""
import csv, sys
from collections import defaultdict

def diagnosticar(tema_id):
    with open('data/eventos.csv', encoding='utf-8-sig') as f:
        eventos = [e for e in csv.DictReader(f) if e['tema_id']==tema_id]

    if not eventos:
        print(f'No se encontró ningún evento con tema_id="{tema_id}"')
        return

    por_dia = defaultdict(list)
    for e in eventos:
        por_dia[e['fecha']].append(e)

    dias_distintos = len(por_dia)
    print(f'=== {tema_id} -- {len(eventos)} notas totales, en {dias_distintos} días distintos ===')
    for fecha in sorted(por_dia.keys()):
        notas_del_dia = por_dia[fecha]
        marca = '  <-- muchas en un solo día, revisar' if len(notas_del_dia)>=6 else ''
        print(f'  {fecha}: {len(notas_del_dia)} nota(s){marca}')

    dia_con_mas = max(por_dia.items(), key=lambda x: len(x[1]))
    print(f'\nEjemplos de títulos del día con más notas ({dia_con_mas[0]}), para revisar si son duplicados reales:')
    for e in dia_con_mas[1][:10]:
        print(f'  - {e["descripcion"][:100]}')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Uso: python3 diagnostico_tema.py <tema_id>')
    else:
        diagnosticar(sys.argv[1])
