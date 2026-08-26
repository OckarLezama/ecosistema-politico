name: Robot de monitoreo — temas Nivel 1

on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch: {}

jobs:
  buscar-candidatos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Instalar dependencias
        run: pip install feedparser --break-system-packages

      - name: Buscar coincidencias en fuentes RSS reales
        run: python3 robot_buscar_temas.py

      - name: Guardar novedades (eventos directos + candidatos sin tema)
        run: |
          git config user.name "robot-temas"
          git config user.email "robot@ecosistema-politico.local"
          git add data/eventos.csv data/candidatos_revision.csv
          git diff --staged --quiet || git commit -m "Robot: actualización automática $(date -u +%Y-%m-%d)"
          git push
