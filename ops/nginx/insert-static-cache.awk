#!/usr/bin/awk -f
# ops/nginx/insert-static-cache.awk — make the SPA vhost cache its brand
# assets (logo.png / favicon.png / robots.txt / site.webmanifest) instead of
# letting them inherit `location /`'s no-store policy.
#
# Called by deploy.sh (install_static_root_cache). Reads an nginx config on
# stdin, writes the edited config to stdout, and reports what it did on
# stderr. Exit 0 = config is correct (edited or already correct); exit 1 =
# the config did not parse the way we assumed, caller must restore.
#
# Why this is inserted structurally instead of only documented in
# ops/nginx/app-performance.conf.example: the example has carried the right
# block since it was written, but nothing ever installs it, so a hand-written
# vhost that predates it keeps answering
#     curl -sI https://app.topodrive.top/logo.png
#     cache-control: no-cache, no-store, must-revalidate
#     cf-cache-status: BYPASS
# (verified against production on 2026-10-11). That is the image the boot
# shell paints in its very first frame, so every single page load paid an
# origin round trip for 2 KB of PNG.
#
# Placement rules:
#   - The block lands at the end of the server{} block that owns the managed
#     SPA fallback (try_files $uri /index.<ts>.html or /__APP_INDEX__), so it
#     can never be spliced into an unrelated vhost that merely shares the
#     file.
#   - A file with no server{} block (a bare location-list include) gets the
#     block appended at EOF.
#   - A config that already serves any of those filenames from a location of
#     its own is left byte-identical, so running this twice — or running it
#     over a vhost that already follows the example — is a no-op.
#
# Why awk and not sed: the insertion point is "the closing brace of the
# server block that contains the SPA fallback", which is a brace-depth
# question. A sed range over the last `}` in the file happily picks the
# closing brace of the wrong block on a config that carries more than one
# vhost (80 + 443 is the normal shape).

BEGIN {
    # `\\.` (not `\.`) so a vhost that already spells the names the way an
    # nginx regex does — `logo\.png` — is recognised too. The first version
    # used `\.` and happily appended a second, dead block on top of the
    # operator's own.
    brand_re = "favicon\\\\.png|logo\\\\.png"
    fallback_re = "try_files[[:space:]]+\\$uri[[:space:]]+/(__APP_INDEX__|index\\.[0-9]+\\.html);"
    depth = 0
    blk = 0
    brand_anywhere = 0
    insert_before = 0
}

# Buffer the whole file: the insertion point is only known once the server
# block that owns the SPA fallback has been fully read.
{ line[NR] = $0 }

END {
    for (i = 1; i <= NR; i++) {
        l = line[i]

        # Start of a top-level block. `depth <= 1` keeps this to server{}
        # blocks and to the location{} blocks nested directly inside one
        # (or at the top level of a bare include); a location nested deeper
        # than that is not something nginx allows anyway.
        if (!blk && depth <= 1 && l ~ /^[[:space:]]*(server|location)[[:space:]].*\{[[:space:]]*$/) {
            blk = 1
            blk_is_server = (l ~ /^[[:space:]]*server[[:space:]]/)
            blk_fallback = 0
            blk_brand = (l ~ brand_re)
            if (blk_brand) brand_anywhere = 1
            blk_depth = depth
            depth += 1
            continue
        }

        n = gsub(/\{/, "{", l); depth += n
        n = gsub(/\}/, "}", l); depth -= n
        if (depth < 0) depth = 0

        if (l ~ fallback_re) blk_fallback = 1
        if (l ~ brand_re) { blk_brand = 1; brand_anywhere = 1 }

        if (blk && depth <= blk_depth) {
            if (blk_is_server && blk_fallback && !blk_brand) insert_before = i
            depth = blk_depth
            blk = 0
        }
    }

    if (depth != 0 || blk) {
        print "insert-static-cache.awk: unbalanced braces — refusing to edit" > "/dev/stderr"
        exit 1
    }

    if (brand_anywhere) {
        for (i = 1; i <= NR; i++) print line[i]
        print "insert-static-cache.awk: brand assets already served by a location — nothing to do" > "/dev/stderr"
        exit 0
    }

    if (insert_before) {
        indent = line[insert_before]
        sub(/[^[:space:]].*$/, "", indent)
        if (indent == "") indent = "    "
        for (i = 1; i < insert_before; i++) print line[i]
        emit(indent)
        for (i = insert_before; i <= NR; i++) print line[i]
        print "insert-static-cache.awk: brand-asset location inserted before line " insert_before > "/dev/stderr"
    } else {
        for (i = 1; i <= NR; i++) print line[i]
        emit("    ")
        print "insert-static-cache.awk: no server block with a managed SPA fallback — block appended at EOF" > "/dev/stderr"
    }
    exit 0
}

function emit(pad) {
    print pad "# SOCRATES-STATIC-ROOT — managed by deploy.sh (install_static_root_cache)."
    print pad "# Brand assets must not inherit location /'s no-store policy: /logo.png is"
    print pad "# preloaded and painted by the boot shell in the first frame. Mirrors"
    print pad "# ops/nginx/app-performance.conf.example."
    print pad "location ~* ^/(?:favicon\\.png|logo\\.png|logo-256\\.png|logo-tray\\.png|robots\\.txt|site\\.webmanifest)$ {"
    print pad "    add_header Cache-Control \"public, max-age=604800, stale-while-revalidate=86400\" always;"
    print pad "    add_header Strict-Transport-Security \"max-age=63072000; includeSubDomains; preload\" always;"
    print pad "    add_header Access-Control-Allow-Origin \"*\" always;"
    print pad "    etag on;"
    print pad "    try_files $uri =404;"
    print pad "}"
}
