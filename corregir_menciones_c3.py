#!/usr/bin/env python3
"""Corrige el CSV de menciones históricas de C3, una sola vez:
- fecha de DD/MM/AAAA a AAAA-MM-DD
- "neutral" -> "neutro"
- nombres de actor a la forma EXACTA de la lista curada (Layda Sansores -> Layda Sansores
  San Román, etc.)
- filas con texto en vez de URL en fuente_url -- se vacía ese campo en vez de dejar el
  párrafo (no se puede convertir texto suelto en un link real)

No inventa nada, solo corrige formato. Corre una sola vez.
Uso: python3 corregir_menciones_c3.py
"""
import csv

RUTA = 'data/menciones_actores_c3.csv'

# nombre tal como aparece en tu CSV -> nombre EXACTO de la lista curada
MAPEO_NOMBRES = {
    'Layda Sansores': 'Layda Sansores San Román',
    'Mara Lezama': 'Mara Lezama Espinosa',
    'Ana Patricia Peralta': 'Ana Patricia Peralta de la Peña',
}

def corregir_fecha(f):
    f = f.strip()
    if '/' in f:
        d, m, a = f.split('/')
        return f'{a}-{m.zfill(2)}-{d.zfill(2)}'
    return f  # ya viene en AAAA-MM-DD, se deja igual

def corregir_sentimiento(s):
    s = s.strip().lower()
    if s == 'neutral':
        return 'neutro'
    if s in ('positivo', 'negativo', 'neutro'):
        return s
    return 'neutro'  # cualquier valor raro, por seguridad, cae en neutro (no en positivo/negativo)

def es_url_real(texto):
    return texto.strip().startswith('http')

def corregir():
    with open(RUTA, encoding='utf-8-sig') as f:
        filas = list(csv.DictReader(f))

    cambios_fecha, cambios_sentimiento, cambios_nombre, urls_vaciadas = 0, 0, 0, 0
    for fila in filas:
        # filas mal formadas (con comas sueltas dentro de texto sin comillas) generan
        # columnas de más -- csv.DictReader las mete en la llave especial None. Se
        # descartan aquí en vez de tronar al escribir (ya identificamos antes esas 2
        # filas específicas con párrafo completo en vez de URL -- esto las limpia también)
        fila.pop(None, None)

        fecha_nueva = corregir_fecha(fila['fecha'])
        if fecha_nueva != fila['fecha']:
            cambios_fecha += 1
            fila['fecha'] = fecha_nueva

        sent_nuevo = corregir_sentimiento(fila['sentimiento'])
        if sent_nuevo != fila['sentimiento']:
            cambios_sentimiento += 1
            fila['sentimiento'] = sent_nuevo

        if fila['actor'] in MAPEO_NOMBRES:
            cambios_nombre += 1
            fila['actor'] = MAPEO_NOMBRES[fila['actor']]

        if fila.get('fuente_url') and not es_url_real(fila['fuente_url']):
            urls_vaciadas += 1
            fila['fuente_url'] = ''

    campos = ['fecha', 'entidad', 'actor', 'sentimiento', 'evento_id', 'fuente_url', 'titular']
    with open(RUTA, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL, restval='')
        w.writeheader()
        for fila in filas:
            w.writerow(fila)

    print(f'Fechas corregidas: {cambios_fecha}')
    print(f'Sentimientos corregidos (neutral->neutro): {cambios_sentimiento}')
    print(f'Nombres de actor corregidos: {cambios_nombre}')
    print(f'URLs con texto en vez de link, vaciadas: {urls_vaciadas}')
    print(f'Total de filas procesadas: {len(filas)}')


if __name__ == '__main__':
    corregir()
