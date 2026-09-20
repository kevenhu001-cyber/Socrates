import re

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


def block_for(mode):
    # [data-theme=socrates][data-mode=dark]{...}
    m = re.search(r'\[data-theme=socrates\]\[data-mode=%s\]\{(.*?)\}' % mode, src, re.S)
    d = {}
    for k, v in re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', m.group(1)):
        d[k] = v.strip()
    return d


def hexify(v):
    v = v.strip()
    if v.startswith('#'):
        return v.lower()
    m = re.match(r'^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$', v)
    if m:
        return hsl_to_hex(*(float(g) for g in m.groups()))
    return v


for mode in ('dark', 'light'):
    d = block_for(mode)
    print('=' * 62)
    print('FRONTEND GROUND TRUTH — %s   ([data-theme=socrates][data-mode=%s])' % (mode.upper(), mode))
    print('=' * 62)
    order = ['bg-000', 'bg-100', 'bg-200', 'bg-300', 'bg-400',
             'text-000', 'text-100', 'text-200', 'text-300', 'text-400', 'text-500',
             'border-100', 'border-200', 'border-300', 'border-400',
             'accent-000', 'accent-100', 'accent-900',
             'brand-000', 'brand-100', 'oncolor-100']
    for k in order:
        v = d.get('--' + k)
        if v is None:
            continue
        print('  --%-14s %-18s -> %s' % (k, v, hexify(v)))
    extra = sorted(set(k for k in d if k[2:] not in [o for o in order]))
    if extra:
        print('  (other)')
        for k in extra:
            print('  --%-14s %-18s -> %s' % (k[2:], d[k], hexify(d[k])))
    print()

# :root aliases
m = re.search(r':root\{(--surface-.*?)\}', src, re.S)
if m:
    print('=== :root surface/text aliases ===')
    for k, v in re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', m.group(1)):
        print('  %-22s %s' % (k, v))
    print()

# always-black / other globals
print('=== misc globals ===')
for name in ['--always-black', '--always-white', '--chat-bubble-radius', '--font-scale']:
    for mm in re.finditer(re.escape(name) + r'\s*:\s*([^;}]+)', src):
        print('  %-22s %s' % (name, mm.group(1).strip()))
        break
