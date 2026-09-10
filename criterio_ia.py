"""
CRITERIO ÚNICO DE AHORRO DE CRÉDITO DE IA
==========================================
Una sola pieza reutilizable para TODOS los módulos que algún día usen IA (Análisis,
Agenda/Matriz/Notas/Genealogía, Red de Actores, Legislativo). Nunca se debe volver a
escribir esta lógica por separado en cada script -- se importa desde aquí.

LA IDEA: antes de pagar por una llamada a la IA, comparamos la "huella" actual de lo
que se va a analizar (números y categorías clave) contra la última huella que SÍ generó
una respuesta de IA. Si no cambió nada que de verdad alteraría lo que la IA diría, no se
gasta crédito -- se reutiliza el análisis anterior tal cual.
"""
import json
import os

RUTA_CACHE_HUELLAS = 'data/huellas_ia.json'


def cargar_huella_previa(entidad_id):
    if not os.path.exists(RUTA_CACHE_HUELLAS):
        return None
    with open(RUTA_CACHE_HUELLAS, encoding='utf-8') as f:
        todas = json.load(f)
    return todas.get(entidad_id)


def guardar_huella(entidad_id, huella):
    todas = {}
    if os.path.exists(RUTA_CACHE_HUELLAS):
        with open(RUTA_CACHE_HUELLAS, encoding='utf-8') as f:
            todas = json.load(f)
    todas[entidad_id] = huella
    with open(RUTA_CACHE_HUELLAS, 'w', encoding='utf-8') as f:
        json.dump(todas, f, ensure_ascii=False, indent=2)


def vale_la_pena_usar_ia(entidad_id, huella_nueva, campos_categoricos=None, campos_numericos=None):
    """campos_categoricos: cualquier cambio ya justifica gastar (ej. actor principal).
    campos_numericos: dict {campo: cambio_minimo} -- solo justifica si cambió esa cantidad o más.
    Devuelve (True/False, razón)."""
    campos_categoricos = campos_categoricos or []
    campos_numericos = campos_numericos or {}

    huella_previa = cargar_huella_previa(entidad_id)
    if not huella_previa:
        return True, 'primera vez que se analiza esta entidad'

    for campo in campos_categoricos:
        if huella_previa.get(campo) != huella_nueva.get(campo):
            return True, f'cambió "{campo}": {huella_previa.get(campo)} -> {huella_nueva.get(campo)}'

    for campo, minimo in campos_numericos.items():
        anterior = huella_previa.get(campo) or 0
        actual = huella_nueva.get(campo) or 0
        if abs(actual - anterior) >= minimo:
            return True, f'"{campo}" cambió {abs(actual-anterior)} (mínimo exigido: {minimo})'

    return False, 'sin cambios sustanciales desde el último análisis -- se reutiliza el anterior, no se gasta crédito'
