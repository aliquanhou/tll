with open('lib/parser.tll', 'r') as f:
    content = f.read()
content = content.replace('return t["type"] == type', 'return t["type"] == tkType')
with open('lib/parser.tll', 'w') as f:
    f.write(content)
print('done')
