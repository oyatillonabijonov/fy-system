#!/bin/sh
# Company settings, applied when the web container starts (nginx's image runs /docker-entrypoint.d/*.sh before nginx),
# so ONE image serves every customer and only the environment differs:
#   PRODUCT_MODE=1                     a customer's install: nothing of ours is assumed, the app shows "not set up"
#                                      until COMPANY_NAME, APP_URL, API_URL and SUPABASE_ANON_KEY are given
#   COMPANY_NAME, COMPANY_SHORT_NAME, COMPANY_TAGLINE, APP_URL, API_URL, SUPABASE_ANON_KEY
#   /brand (a mounted folder)          logo.svg, logo-white.svg, favicon.svg, icon-192.png, icon-512.png,
#                                      icon-maskable-512.png, apple-touch-icon.png, login-bg.jpg — any subset
# Nothing set and no /brand = nothing is touched: the files stay as built (the ERP).
# It must never stop the container: no `set -e`, every step stands alone. The worker reads the same variables
# (amo-sync/src/company.ts); the app reads /config.js in src/lib/config.ts.

ROOT=/usr/share/nginx/html
[ -n "$PRODUCT_MODE$COMPANY_NAME$COMPANY_SHORT_NAME$COMPANY_TAGLINE$APP_URL$API_URL$SUPABASE_ANON_KEY" ] || [ -d /brand ] || exit 0

clean() { printf '%s' "$1" | tr -d '\000-\037'; }                                          # one line, no control characters
js()    { clean "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g'; }             # inside a JS / JSON string
html()  { clean "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }
rep()   { sed -e 's/[\\&|]/\\&/g'; }                                                       # safe as a sed replacement (delimiter |)

SHORT=$COMPANY_SHORT_NAME
[ -z "$SHORT" ] && [ "$PRODUCT_MODE" = 1 ] && SHORT=$COMPANY_NAME

# The customer's own files over ours
LOGIN_BG=
if [ -d /brand ]; then
  put() { [ -f "/brand/$1" ] && cp -f "/brand/$1" "$ROOT/$2"; }
  put logo.svg Sidebar/Logo.svg
  put logo-white.svg Sidebar/Logo-white.svg
  put favicon.svg favicon.svg
  put icon-192.png icons/icon-192.png
  put icon-512.png icons/icon-512.png
  put icon-maskable-512.png icons/icon-maskable-512.png
  put apple-touch-icon.png icons/apple-touch-icon.png
  put login-bg.jpg images/login-bg.jpg && LOGIN_BG=/images/login-bg.jpg
fi

# /config.js: only what was given (the app has the defaults)
kv() { [ -n "$2" ] && printf '"%s":"%s",' "$1" "$(js "$2")"; }
{
  printf 'window.__APP_CONFIG__ = {'
  [ "$PRODUCT_MODE" = 1 ] && printf '"productMode":true,'
  kv companyName "$COMPANY_NAME"
  kv shortName "$SHORT"
  kv tagline "$COMPANY_TAGLINE"
  kv appUrl "$APP_URL"
  kv apiUrl "$API_URL"
  kv anonKey "$SUPABASE_ANON_KEY"
  kv loginBg "$LOGIN_BG"
  printf '};\n'
} > "$ROOT/config.js"

# The tab title and the installed app's name are static files: rewritten here
if [ -n "$COMPANY_NAME" ]; then
  t=$(html "$COMPANY_NAME" | rep)
  sed -i "s|<title>[^<]*</title>|<title>$t</title>|" "$ROOT/index.html"
  n=$(js "$COMPANY_NAME" | rep)
  # whole lines: a value with a quote in it must not stop the match on a restart
  sed -i -e "s|^  \"name\": .*|  \"name\": \"$n\",|" \
         -e "s|^  \"description\": .*|  \"description\": \"$n: sotuv, vazifalar va mijozlar.\",|" "$ROOT/manifest.webmanifest"
fi
if [ -n "$SHORT" ]; then
  s=$(html "$SHORT" | rep)
  sed -i "s|\(name=\"apple-mobile-web-app-title\" content=\"\)[^\"]*|\1$s|" "$ROOT/index.html"
  s=$(js "$SHORT" | rep)
  sed -i "s|^  \"short_name\": .*|  \"short_name\": \"$s\",|" "$ROOT/manifest.webmanifest"
fi
exit 0
