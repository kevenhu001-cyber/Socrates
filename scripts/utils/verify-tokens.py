"""
Verify packages/theme/src/rn.ts against the palette the web app actually
renders: the [data-theme=socrates][data-mode=*] blocks in frontend/src/styles.css.

Role map comes from the :root aliases in the same file:
  --surface-page:    var(--bg-100)     -> bg.page
  --surface-raised:  var(--bg-200)     -> bg.raised
  --surface-overlay: var(--bg-000)     -> bg.overlay
  --surface-hover:   var(--bg-300)     -> bg.hover
  --text-primary:    var(--text-100)   -> text.primary
  --text-secondary:  var(--text-400)   -> text.tertiary
  --text-tertiary:   var(--text-500)   -> text.muted
  --border-default:  var(--border-300) -> border.default
  --accent:          var(--accent-000) -> accent.strong
  --accent-bg:       var(--accent-900) -> accent.soft
"""
import re
import sys


def hsl_to_hex(h, s, l):
    s /= 100.0; l /= 100.0
    c = (1 - abs(2 * l - 1)) * s
    hp = h / 60.0
    x = c * (1 - abs(hp % 2 - 1))
    if hp < 1: r, g, b = c, x, 0
    elif hp < 2: r, g, b = x, c, 0
    elif hp < 3: r, g, b = 0, c, x
    elif hp < 4: r, g, b = 0, x, c
    elif hp < 5: r, g, b = x, 0, c
    else: r, g, b = c, 0, x
    m = l - c / 2
    f = lambda v: max(0, min(255, int(round((v + m) * 255))))
    return '#%02x%02x%02x' % (f(r), f(g), f(b))


src = open('frontend/src/styles.css', encoding='utf-8').read()


def legacy(mode):
    m = re.search(r'\[data-theme=socrates\]\[data-mode=%s\]\{(.*?)\}' % mode, src, re.S)
    d = {}
    for k, v in re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', m.group(1)):
        d[k[2:]] = v.strip()
    return d


def hexify(v):
    v = v.strip()
    if v.startswith('#'):
        return v.lower()
    m = re.match(r'^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$', v)
    if m:
        return hsl_to_hex(*(float(g) for g in m.groups()))
    return v


def parse_rn():
    out, mode, stack = {}, None, []
    for line in open('packages/theme/src/rn.ts', encoding='utf-8').read().splitlines():
        mm = re.match(r'\s*const (\w+): ThemePaletteHex = \{', line)
        if mm:
            mode = 'dark' if mm.group(1).startswith('dark') else 'light'
            out[mode] = {}
            stack = [out[mode]]
            continue
        if mode is None:
            continue
        if re.match(r'^\s*\};\s*$', line):
            mode, stack = None, []
            continue
        mm = re.match(r'\s*(\w+):\s*\{\s*$', line)
        if mm:
            d = {}
            stack[-1][mm.group(1)] = d
            stack.append(d)
            continue
        if re.match(r'^\s*\},\s*$', line):
            if len(stack) > 1:
                stack.pop()
            continue
        mm = re.match(r"\s*(\w+):\s*'(#[0-9a-fA-F]{6})'", line)
        if mm:
            stack[-1][mm.group(1)] = mm.group(2)
    return out


MAP = [
    ('accent', 'strong', 'accent-000'), ('accent', 'soft', 'accent-900'),
    ('accent', 'surface', 'accent-900'),
    ('bg', 'page', 'bg-100'), ('bg', 'raised', 'bg-200'), ('bg', 'overlay', 'bg-000'),
    ('bg', 'hover', 'bg-300'), ('bg', 'sunken', 'bg-400'),
    ('text', 'primary', 'text-100'), ('text', 'secondary', 'text-200'),
    ('text', 'tertiary', 'text-400'), ('text', 'muted', 'text-500'),
    ('border', 'subtle', 'border-100'), ('border', 'default', 'border-300'),
    ('border', 'strong', 'border-400'),
]

rn = parse_rn()
bad = 0
for mode in ('dark', 'light'):
    leg = legacy(mode)
    print('=' * 78)
    print('%s   (frontend/src/styles.css  ->  packages/theme/src/rn.ts)' % mode.upper())
    print('=' * 78)
    for grp, key, var in MAP:
        expect = hexify(leg[var])
        have = (rn[mode].get(grp) or {}).get(key)
        ok = (have or '').lower() == expect
        if not ok:
            bad += 1
        print('  %-8s %-16s --%-12s %-14s expected=%s  rn=%s' % (
            'OK' if ok else 'MISMATCH', grp + '.' + key, var, leg[var], expect, have))

print()
if bad:
    print('FAILED: %d token(s) still diverge from the web app.' % bad)
    sys.exit(1)
print('PASS: every mapped token matches the web app exactly.')
