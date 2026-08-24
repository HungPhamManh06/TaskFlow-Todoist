#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).with_name('phase6-2-direct-hotfix.py')
source = path.read_text(encoding='utf-8')
old = "out, n = re.subn(pattern, repl, text, count=1, flags=flags)"
new = "out, n = re.subn(pattern, lambda _m: repl, text, count=1, flags=flags)"
if old not in source:
    raise SystemExit('hotfix runner: expected sub_once implementation not found')
source = source.replace(old, new, 1)
code = compile(source, str(path), 'exec')
exec(code, {'__name__': '__main__', '__file__': str(path)})
