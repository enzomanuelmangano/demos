#!/usr/bin/env python3
"""Finds a child with flex=1 (or flex-grow) whose parent is a plain `view`/`box` that is not a
flex container: in Exact a `view` is a block, so the child gets no height (RN's View is
flex-column). Prints file:line of each parent. Usage: python3 tools/lint-flex.py [files…]"""
import re, sys, glob

def nodes(lines):
    """(indent, tag line index, attrs text) for each node: a line with a tag word, plus its
    continuation lines (deeper indent, starting with an attribute)."""
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r'^(\s*)([a-z][a-z0-9-]*)\b(.*)$', line)
        if m and not line.strip().startswith('//') and m.group(2) not in ('if', 'else', 'for', 'case', 'match', 'let', 'action', 'state', 'derive', 'props', 'view', 'slot') or (m and m.group(2) == 'view' and m.group(3).strip() != ''):
            indent = len(m.group(1)); attrs = m.group(3); j = i + 1
            while j < len(lines) and lines[j].strip() and len(lines[j]) - len(lines[j].lstrip()) > indent and re.match(r'^\s*[-a-z]+[=]', lines[j]) :
                attrs += ' ' + lines[j].strip(); j += 1
            out.append((indent, i, m.group(2), attrs)); i = j; continue
        i += 1
    return out

for f in sys.argv[1:] or glob.glob('demos/*/*.contract'):
    if f.endswith('.test.contract'): continue
    lines = open(f).read().split('\n')
    ns = nodes(lines)
    for k, (ind, li, tag, attrs) in enumerate(ns):
        if tag in ('view', 'box') and 'display="flex"' not in attrs and 'display=(' not in attrs \
                and re.search(r'(^|\s)(align-items|justify-content|flex-direction|gap|row-gap|column-gap|flex-wrap)=', attrs):
            print(f'{f}:{li+1}: {tag} is not a flex container; its flex layout attributes do nothing')
        if not re.search(r'(^|\s)(flex=1|flex-grow=)', attrs): continue
        for pind, pli, ptag, pattrs in reversed(ns[:k]):
            if pind < ind:
                if ptag in ('view', 'box') and 'display="flex"' not in pattrs and 'display=(' not in pattrs:
                    print(f'{f}:{pli+1}: {ptag} is not a flex container; its child at line {li+1} has flex')
                break
