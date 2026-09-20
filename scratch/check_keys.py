import os, re

pattern = re.compile(r'key=\{([^}]+)\}')
suspicious = []
for root, dirs, files in os.walk('apps/web/src'):
    for f in files:
        if f.endswith(('.tsx',)):
            path = os.path.join(root, f)
            try:
                with open(path, 'r', encoding='utf-8') as fp:
                    for idx, line in enumerate(fp, 1):
                        m = pattern.search(line)
                        if m:
                            val = m.group(1).strip()
                            if val in ('tag', 't', 'cat', 'category', 'status', 'role', 'title', 'item'):
                                suspicious.append(f'{path}:{idx}: {line.strip()} (key={val})')
            except Exception:
                pass

print(f'Suspicious keys found: {len(suspicious)}')
for s in suspicious:
    print(' ', s)

