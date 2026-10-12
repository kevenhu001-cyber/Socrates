#!/usr/bin/awk -f
# ops/nginx/insert-spa-cache.awk — make the public SPA document edge-cacheable.
#
# The app vhost is maintained on production rather than copied wholesale from
# the example file. This structural rewrite updates only the managed
# `location /` fallback and the versioned `index.<timestamp>.html` location,
# leaving API, Expo, and static-asset policies untouched.

BEGIN {
    depth = 0
    block = 0
    found = 0
    fallback_re = "try_files[[:space:]]+\\$uri([[:space:]]+\\$uri/)?[[:space:]]+/(__APP_INDEX__|index\\.[0-9]+\\.html);"
}

{ line[NR] = $0 }

END {
    # First pass: mark the complete location blocks we own. Buffering avoids
    # emitting a partial block before we know whether its try_files target is
    # the managed SPA entry.
    for (i = 1; i <= NR; i++) {
        l = line[i]

        if (!block && depth <= 1 && l ~ /^[[:space:]]*location[[:space:]]+.*\{[[:space:]]*$/) {
            block = 1
            block_start = i
            block_depth = depth
            block_is_root = (l ~ /^[[:space:]]*location[[:space:]]+\/[[:space:]]*\{[[:space:]]*$/)
            block_is_versioned = (l ~ /^[[:space:]]*location[[:space:]]+~[[:space:]]/ && l ~ /index/ && l ~ /html/)
            block_fallback = 0
            n = gsub(/\{/, "{", l); depth += n
            n = gsub(/\}/, "}", l); depth -= n
            if (depth < 0) depth = 0
            continue
        }

        if (block && l ~ fallback_re) block_fallback = 1

        n = gsub(/\{/, "{", l); depth += n
        n = gsub(/\}/, "}", l); depth -= n
        if (depth < 0) depth = 0

        if (block && depth <= block_depth) {
            if ((block_is_root && block_fallback) || block_is_versioned) {
                found = 1
                for (j = block_start; j <= i; j++) target[j] = 1
            }
            block = 0
        }
    }

    if (depth != 0 || block) {
        print "insert-spa-cache.awk: unbalanced braces — refusing to edit" > "/dev/stderr"
        exit 1
    }
    if (!found) {
        print "insert-spa-cache.awk: no managed SPA location found" > "/dev/stderr"
        exit 1
    }

    # Second pass: replace old no-store/no-cache headers and remove stale
    # Pragma/Expires directives. The CDN-specific headers are deliberately
    # emitted alongside Cache-Control so Cloudflare and EdgeOne can make an
    # edge decision without changing browser revalidation semantics later.
    for (i = 1; i <= NR; i++) {
        l = line[i]
        if (!target[i]) {
            print l
            continue
        }
        if (l ~ /^[[:space:]]*add_header[[:space:]]+Cache-Control[[:space:]]/) {
            indent = l
            sub(/[^[:space:]].*$/, "", indent)
            print indent "add_header Cache-Control \"public, max-age=60, stale-while-revalidate=600, stale-if-error=86400\" always;"
            print indent "add_header CDN-Cache-Control \"public, max-age=60, stale-while-revalidate=600, stale-if-error=86400\" always;"
            print indent "add_header Cloudflare-CDN-Cache-Control \"public, max-age=60, stale-while-revalidate=600, stale-if-error=86400\" always;"
        } else if (l !~ /^[[:space:]]*add_header[[:space:]]+(CDN-Cache-Control|Cloudflare-CDN-Cache-Control|Pragma|Expires)[[:space:]]/) {
            print l
        }
    }
}
