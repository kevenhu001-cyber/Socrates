#!/usr/bin/env bash
# search.sh — Web search via local SearXNG instance
# Usage:  ./scripts/search.sh <query> [count=10]
#
# Examples:
#   ./scripts/search.sh "quantum computing"
#   ./scripts/search.sh "Node.js event loop" 5

set -euo pipefail

QUERY="${1:?Usage: search.sh <query> [count]}"
COUNT="${2:-10}"
SEARXNG_URL="http://127.0.0.1:8888/search"

# URL-encode the query
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$QUERY'))")

curl -s --max-time 30 "$SEARXNG_URL?q=$ENCODED&format=json&pageno=1&language=zh-CN" |
python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    results = data.get('results', [])
    if not results:
        print('No results found.')
        sys.exit(0)
    print(f'── {len(results)} results for \"$QUERY\" ──\n')
    for i, r in enumerate(results[:$COUNT], 1):
        title = r.get('title', '?')
        url = r.get('url', '?')
        snippet = r.get('content', '')[:150].replace(chr(10), ' ')
        engine = r.get('engine', '?')
        print(f'{i}. [{engine}] {title}')
        print(f'   {url}')
        if snippet:
            print(f'   {snippet}')
        print()
except json.JSONDecodeError as e:
    print(f'Error: {e}')
    text = sys.stdin.read()
    print(f'Raw response: {text[:200]}')
"
