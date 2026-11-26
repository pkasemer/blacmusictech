#!/usr/bin/env bash
# Adds the admin site's nginx server block next to the Backend's. Run as root on the VPS:
#
#   scp deploy/nginx/blacadmin.conf root@HOST:/tmp/blacadmin.conf
#   ssh root@HOST 'bash -s' < deploy/nginx-setup.sh
#
# It never edits another site's configuration. nginx is only reloaded after `nginx -t` passes,
# and a failed test removes the new site again. Needs the Backend's nginx setup (it provides
# /etc/nginx/blacmusic/ with the certificate files and the Cloudflare address ranges).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
SRC=/tmp/blacadmin.conf
[ -f "$SRC" ] || { echo "upload deploy/nginx/blacadmin.conf to $SRC first"; exit 1; }
for f in /etc/nginx/blacmusic/fullchain.pem /etc/nginx/blacmusic/privkey.pem /etc/nginx/blacmusic/cloudflare-realip.conf; do
  [ -f "$f" ] || { echo "missing $f (run the Backend's deploy/nginx-setup.sh first)"; exit 1; }
done
cp "$SRC" /etc/nginx/sites-available/blacadmin.conf
ln -sfn /etc/nginx/sites-available/blacadmin.conf /etc/nginx/sites-enabled/blacadmin.conf
if nginx -t 2>&1; then
  systemctl reload nginx
  echo "nginx reloaded"
else
  echo "nginx -t FAILED, removing the new site"
  rm -f /etc/nginx/sites-enabled/blacadmin.conf
  nginx -t 2>&1 | tail -3
  exit 1
fi
