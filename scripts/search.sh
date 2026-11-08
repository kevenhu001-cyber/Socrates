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
if ! [[ "$COUNT" =~ ^[1-9][0-9]*$ ]]; then
  printf 'count must be a positive integer\n' >&2
  exit 2
fi

# Pass user input as argv; never interpolate it into Python source.
ENCODED=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$QUERY")

curl -fsS --max-time 30 "$SEARXNG_URL?q=$ENCODED&format=json&pageno=1&language=zh-CN" |
python3 -c '
import json
import sys

query = sys.argv[1]
count = int(sys.argv[2])
raw = sys.stdin.read()
try:
    data = json.loads(raw)
    results = data.get("results", [])
    if not results:
        print("No results found.")
        sys.exit(0)
    print(f"── {len(results)} results for {query!r} ──\n")
    for i, result in enumerate(results[:count], 1):
        title = result.get("title", "?")
        url = result.get("url", "?")
        snippet = result.get("content", "")[:150].replace(chr(10), " ")
        engine = result.get("engine", "?")
        print(f"{i}. [{engine}] {title}")
        print(f"   {url}")
        if snippet:
            print(f"   {snippet}")
        print()
except json.JSONDecodeError as error:
    print(f"Error: {error}")
    print(f"Raw response: {raw[:200]}")
' "$QUERY" "$COUNT"
