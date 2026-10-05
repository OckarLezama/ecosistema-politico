#!/usr/bin/env bash
# Corre un robot EN BUCLE dentro de un solo job de GitHub Actions.
#
# Por qué: los cron de GitHub NO son confiables (se saltan o retrasan horas, sobre todo
# lunes / horas pico). Antes cada corrida era un job nuevo disparado por cron: si GitHub
# se saltaba el cron, no pasaba nada hasta la siguiente corrida que sí disparara (hoy:
# de las 03:14 a las 11:30 CDMX sin actualizar). Ahora el cron solo sirve para
# "arrancar/relevar" el job; el job mismo repite el robot cada INTERVALO segundos hasta
# casi el límite de 6 h, así la frecuencia ya no depende de que GitHub dispare cada cron.
#
# Uso (variables de entorno):
#   ROBOT_NAME, ROBOT_EMAIL   identidad del commit
#   ROBOT_CMD                 comando que corre el robot (ej. "python3 robot_portadas.py")
#   ROBOT_FILES               archivos/carpetas a agregar (separados por espacio)
#   COMMIT_MSG                mensaje de commit
#   LOOP_MINUTES (335)        duracion maxima del bucle
#   INTERVALO (300)           segundos entre corridas
#   PUSH_STRATEGY (rebase)    'ours' para snapshots que se recalculan completos
#   AFTER_PUSH_CMD            comando opcional tras publicar con exito
#   STOP_AT_UTC_HOUR          (opcional) sale cuando la hora UTC sea esa (ej. 0 = 18:00 CDMX)
set -u
LOOP_MINUTES="${LOOP_MINUTES:-335}"
INTERVALO="${INTERVALO:-300}"
FIN=$(( $(date +%s) + LOOP_MINUTES*60 ))

git config user.name "$ROBOT_NAME"
git config user.email "$ROBOT_EMAIL"

publicar() {
  # reintenta con rebase; si hay conflicto real, aborta y falla visible (no se descartan datos)
  for intento in 1 2 3 4 5; do
    git push origin HEAD:main && return 0
    git fetch origin main
    if [ "${PUSH_STRATEGY:-rebase}" = "ours" ]; then
      # archivo-snapshot que se recalcula completo: ante conflicto gana lo recien calculado
      git merge origin/main -X ours --no-edit -m "Merge origin/main (snapshot regenerado)" || { git merge --abort; return 1; }
    elif ! git rebase origin/main; then
      git rebase --abort
      echo "Conflicto real al reintegrar cambios" >&2
      return 1
    fi
    sleep $((RANDOM % 5 + 1))
  done
  return 1
}

while :; do
  # siempre arrancar cada vuelta desde lo ultimo que haya en main (otros robots empujan)
  git fetch origin main -q && git reset -q --hard origin/main

  echo "=== $(date -u +%FT%TZ) corrida ==="
  eval "$ROBOT_CMD" || echo "el robot fallo en esta vuelta (se reintenta en la siguiente)"

  # shellcheck disable=SC2086
  git add $ROBOT_FILES 2>/dev/null
  if ! git diff --staged --quiet; then
    git commit -q -m "$COMMIT_MSG"
    if publicar; then
      [ -n "${AFTER_PUSH_CMD:-}" ] && { eval "$AFTER_PUSH_CMD" || echo "AFTER_PUSH_CMD fallo" >&2; }
    else
      echo "no se pudo publicar en esta vuelta" >&2
    fi
  fi

  [ "${GITHUB_EVENT_NAME:-}" = "workflow_dispatch" ] && { echo "corrida manual: una sola pasada"; break; }
  [ -n "${STOP_AT_UTC_HOUR:-}" ] && [ "$(date -u +%-H)" = "$STOP_AT_UTC_HOUR" ] && { echo "fin de ventana"; break; }
  [ $(( $(date +%s) + INTERVALO )) -ge "$FIN" ] && { echo "fin del bucle (relevo del siguiente job)"; break; }
  sleep "$INTERVALO"
done
exit 0
