with open('lib/parser.tll', 'r') as f:
    lines = f.readlines()

# Fix parseStatement function: lines 83-100 approximately
# Replace 'let type = t["type"]' with 'let stmtType = t["type"]'
# and 'if type ==' with 'if stmtType =='
in_parse_statement = False
for i, line in enumerate(lines):
    if 'fn parseStatement()' in line:
        in_parse_statement = True
    elif in_parse_statement and line.startswith('fn '):
        in_parse_statement = False

    if in_parse_statement:
        if 'let type = t["type"]' in line:
            lines[i] = line.replace('let type = t["type"]', 'let stmtType = t["type"]')
        elif 'if type ==' in line:
            lines[i] = line.replace('if type ==', 'if stmtType ==')

with open('lib/parser.tll', 'w') as f:
    f.writelines(lines)

print('done')
