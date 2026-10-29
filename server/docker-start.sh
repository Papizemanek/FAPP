#!/bin/sh
# Start v kontejneru: server běží jako neprivilegovaný uživatel „node“, ne jako root.
# Připojený disk (/data) bývá po startu vlastněný rootem – nejdřív ho předáme uživateli node,
# pak se práva roota zahodí (setpriv z util-linux).
set -e
if [ "$(id -u)" = "0" ] && command -v setpriv >/dev/null 2>&1 && id node >/dev/null 2>&1; then
  mkdir -p /data
  chown -R node:node /data
  exec setpriv --reuid=node --regid=node --init-groups --inh-caps=-all \
    node --disable-warning=ExperimentalWarning /srv/server/src/index.js
fi
exec node --disable-warning=ExperimentalWarning /srv/server/src/index.js
