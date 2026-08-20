with open('server/ai.js', 'rb') as f:
    content = f.read()
idx = content.find(b'});')
positions = []
while idx != -1:
    positions.append(idx)
    idx = content.find(b'});', idx + 1)
print('Found ' + str(len(positions)) + ' occurrences of });')
for pos in positions:
    start = max(0, pos - 50)
    end = min(len(content), pos + 20)
    print('At ' + str(pos) + ': ...' + content[start:end].decode('utf-8', errors='replace') + '...')