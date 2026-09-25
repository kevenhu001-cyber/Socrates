#!/usr/bin/awk -f
# ops/nginx/insert-csp-include.awk — wire the SPA CSP snippet into every
# HTML-serving nginx location block, idempotently.
#
# Called by deploy.sh (install_spa_csp). Reads an nginx server config on
# stdin, writes the edited config to stdout, and reports what it did on
# stderr. Exit 0 = config is correct (edited or already correct).
#
# Required variable:  -v snippet=/etc/nginx/snippets/socrates-csp-spa.conf
#
# Why awk and not sed: the two target blocks are
#
#     location / { ... try_files $uri /index.<ts>.html; }
#     location ~ ^/index\.[0-9]+\.html$ { ... }
#
# and the second one's header is itself a regex. Matching it from a sed
# expression means escaping a regex inside a regex inside a shell
# double-quoted string, which silently failed to match at all during the
# 2026-09-25 dry-run against the real production config (1 of 2 blocks got
# the include). A structural pass over brace depth has no such ambiguity.
#
# Idempotency is per-block, not per-file: a config where only one of the two
# blocks carries the include self-heals on the next run. A file-level "does
# the include appear anywhere" guard would leave that state stuck forever.

BEGIN {
    if (snippet == "") {
        print "insert-csp-include.awk: -v snippet=<path> is required" > "/dev/stderr"
        exit 2
    }
    include_re = "include[[:space:]]+" snippet ";"
    depth = 0
    in_loc = 0
    n_added = 0
    n_present = 0
}

# Buffer a candidate location block so we can decide after seeing its body.
function flush_block() {
    if (!in_loc) return

    # HTML-serving if the block either performs the managed SPA fallback or
    # is the versioned-entry location itself.
    html = 0
    if (loc_header ~ /location[[:space:]]+~[[:space:]]+\^\/index\\\.\[0-9\]\+\\\.html\$/) html = 1
    for (i = 1; i <= nbuf; i++) {
        if (buf[i] ~ /try_files[[:space:]]+\$uri[[:space:]]+\/index\.[0-9]+\.html;/) html = 1
        if (buf[i] ~ /try_files[[:space:]]+\$uri[[:space:]]+\/__APP_INDEX__;/) html = 1
    }

    has_include = 0
    for (i = 1; i <= nbuf; i++) if (buf[i] ~ include_re) has_include = 1

    print loc_header
    if (html && !has_include) {
        print loc_indent "    include " snippet ";"
        n_added++
    } else if (html) {
        n_present++
    }
    for (i = 1; i <= nbuf; i++) print buf[i]

    in_loc = 0
    nbuf = 0
}

{
    line = $0

    # Opening of a location block. Note we do NOT require depth == 0: in a
    # real site config every location is nested inside `server { ... }`, so
    # depth is already 1 here. Requiring 0 was the first version's bug — it
    # matched nothing and silently added no includes.
    if (!in_loc && line ~ /^[[:space:]]*location[[:space:]].*\{[[:space:]]*$/) {
        in_loc = 1
        loc_header = line
        loc_indent = line
        sub(/[^[:space:]].*$/, "", loc_indent)
        nbuf = 0
        loc_base_depth = depth      # depth OUTSIDE this block
        depth += 1                  # the brace that opened it
        next
    }

    if (in_loc) {
        n = gsub(/\{/, "{", line); depth += n
        n = gsub(/\}/, "}", line); depth -= n
        buf[++nbuf] = line
        if (depth <= loc_base_depth) { depth = loc_base_depth; flush_block() }
        next
    }

    n = gsub(/\{/, "{", line); depth += n
    n = gsub(/\}/, "}", line); depth -= n
    if (depth < 0) depth = 0
    print line
}

END {
    # A block left open at EOF means the config did not parse the way we
    # assumed. Emit it verbatim and fail so the caller restores the original.
    if (in_loc) {
        print loc_header
        for (i = 1; i <= nbuf; i++) print buf[i]
        print "insert-csp-include.awk: unbalanced location block at EOF" > "/dev/stderr"
        exit 1
    }
    printf "insert-csp-include.awk: %d include(s) added, %d already present\n", \
        n_added, n_present > "/dev/stderr"
}
