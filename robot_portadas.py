#!/usr/bin/env python3
"""
Robot de portadas — descarga automáticamente, cada mañana, la imagen real de la
portada impresa de cada medio configurado (fuente: kiosko.net, URL predecible por
fecha) y actualiza data/titulares.csv con la ruta de esa imagen.

Por qué NO saca el titular como texto: kiosko.net (y los demás kioskos de
portadas) publican la portada como FOTO, no como texto -- no hay titular en
texto en ninguna parte de esas páginas. Sacarlo por OCR es posible pero poco
confiable (tipografías y tamaños muy distintos entre medios, titulares que
parten en dos líneas o cruzan toda la plana), así que este robot se limita a
garantizar la IMAGEN real, que es lo que sí se puede automatizar con
confianza. El campo 'titular' de cada fila se deja tal cual esté (vacío si
nadie lo ha llenado a mano todavía) -- la tarjeta en el sitio ya sabe
mostrarse solo con la imagen cuando no hay texto.

Corre varias veces en la mañana (ver .github/workflows/portadas.yml) porque no
todos los medios publican su portada a la misma hora -- cada corrida vuelve a
intentar solo los medios que aún no tengan imagen de HOY, sin tocar los que ya
la consiguieron en una corrida anterior.

Cómo correrlo: python3 robot_portadas.py
Requiere: solo librería estándar (urllib) -- sin dependencias externas.
"""
import csv
import os
import urllib.request
import urllib.error
import socket
from datetime import datetime, timezone, timedelta

RUTA_TITULARES = 'data/titulares.csv'
DIR_PORTADAS = 'data/portadas'
CAMPOS = ['fecha', 'medio', 'titular', 'categoria', 'url_fuente', 'imagen_url']

# Mexico opera en UTC-6 fijo (sin horario de verano desde 2022) -- si eso
# cambiara algún día, ajustar aquí y los horarios del workflow.
ZONA_MX = timezone(timedelta(hours=-6))

# Medios configurados -- slug real confirmado en kiosko.net, y la categoría por
# default que se le asigna a su fila en el CSV la primera vez que se crea (se
# puede corregir a mano después sin que el robot la pise: solo llena categoria
# si la fila es nueva). Agregar más aquí conforme se confirmen más slugs.
MEDIOS = [
    {'medio': 'El Universal',  'slug': 'universal',   'categoria': 'Seguridad Nacional'},
    {'medio': 'Reforma',       'slug': 'reforma',      'categoria': 'Gobernabilidad'},
    {'medio': 'Milenio',       'slug': 'milenio',      'categoria': 'Seguridad Nacional'},
    {'medio': 'La Jornada',    'slug': 'jornada',      'categoria': 'Social'},
    {'medio': 'El Financiero', 'slug': 'financiero',   'categoria': 'Economía'},
    {'medio': 'El Economista', 'slug': 'eleconomista', 'categoria': 'Economía'},
    {'medio': 'La Prensa',     'slug': 'laprensa',     'categoria': 'Social'},
]


def url_portada(slug, fecha):
    return f"https://img.kiosko.net/{fecha.strftime('%Y/%m/%d')}/mx/mx_{slug}.750.jpg"


def descargar_imagen(url, destino):
    """Descarga la imagen si existe y parece una portada real (no un placeholder
    de error, que kiosko.net a veces sirve con status 200 pero muy pocos bytes)."""
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return False
            datos = resp.read()
    except (urllib.error.URLError, urllib.error.HTTPError, socket.timeout, TimeoutError):
        return False
    if len(datos) < 8000:
        return False
    with open(destino, 'wb') as f:
        f.write(datos)
    return True


def cargar_titulares():
    if not os.path.exists(RUTA_TITULARES):
        return []
    with open(RUTA_TITULARES, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def guardar_titulares(filas):
    with open(RUTA_TITULARES, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=CAMPOS)
        writer.writeheader()
        for fila in filas:
            writer.writerow({c: fila.get(c, '') for c in CAMPOS})


def main():
    hoy = datetime.now(ZONA_MX).date()
    fecha_txt = hoy.strftime('%Y-%m-%d')
    os.makedirs(DIR_PORTADAS, exist_ok=True)

    filas = cargar_titulares()
    indice = {(f['fecha'], f['medio']): f for f in filas}

    conseguidas = 0
    for m in MEDIOS:
        clave = (fecha_txt, m['medio'])
        fila = indice.get(clave)
        if fila and fila.get('imagen_url'):
            print(f"ya   {m['medio']}: ya tiene imagen de hoy, no se reintenta")
            continue

        destino = f"{DIR_PORTADAS}/{fecha_txt}-{m['slug']}.jpg"
        url = url_portada(m['slug'], hoy)
        if descargar_imagen(url, destino):
            if fila:
                fila['imagen_url'] = destino
            else:
                fila = {
                    'fecha': fecha_txt,
                    'medio': m['medio'],
                    'titular': '',
                    'categoria': m['categoria'],
                    'url_fuente': f"https://es.kiosko.net/mx/np/mx_{m['slug']}.html",
                    'imagen_url': destino,
                }
                filas.append(fila)
                indice[clave] = fila
            conseguidas += 1
            print(f"ok   {m['medio']}: imagen conseguida")
        else:
            print(f"--   {m['medio']}: aun sin imagen (se reintenta en la siguiente corrida de hoy)")

    guardar_titulares(filas)
    print(f"Listo. {conseguidas} imagen(es) nueva(s) para {fecha_txt}.")


if __name__ == '__main__':
    main()
