# -*- coding: utf-8 -*-
"""Sửa mojibake (double-encoding UTF-8) TỪNG PHẦN trong app.html.

app.html hiện là file HỖN HỢP: một số phần UTF-8 đúng (được thêm/sửa gần đây),
một số phần bị double-encoding theo CP1252 (đọc nhầm CP1252 rồi lưu thành UTF-8).
→ Chỉ đảo ngược các "run" ký tự trong miền CP1252 nếu đảo ngược ra UTF-8 hợp lệ,
giữ nguyên mọi phần đã đúng. Không bao giờ encode toàn bộ file.
"""
import sys, re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

PATH = sys.argv[1] if len(sys.argv) > 1 else 'app.html'

# Ánh xạ ngược CP1252 → byte gốc (bảng printable của CP1252)
CP1252_BYTE = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
}
# 5 byte CP1252 "không xác định" → Python decode thành C1 control tương ứng
C1_CONTROLS = {0x81: 0x81, 0x8D: 0x8D, 0x8F: 0x8F, 0x90: 0x90, 0x9D: 0x9D}


def to_byte(ch):
    """Byte gốc của 1 ký tự trong miền mojibake; None nếu ngoài miền (đã đúng)."""
    cp = ord(ch)
    if cp < 0x80 or 0xA0 <= cp <= 0xFF:      # ASCII + Latin-1 trực tiếp
        return cp
    if cp in CP1252_BYTE:
        return CP1252_BYTE[cp]
    if cp in C1_CONTROLS:
        return C1_CONTROLS[cp]
    return None


def try_reverse(part):
    """Đảo ngược run `part` → bytes CP1252 → UTF-8. Trả chuỗi đúng hoặc None."""
    try:
        raw = bytes(to_byte(c) for c in part)
        cand = raw.decode('utf-8')
    except (UnicodeDecodeError, UnicodeEncodeError, ValueError):
        return None
    # An toàn: phải khác bản gốc, có ký tự không-ASCII, không chứa C1 control
    if cand == part:
        return None
    if not any(ord(c) > 0x7F for c in cand):
        return None
    if any(0x80 <= ord(c) <= 0x9F for c in cand):
        return None
    return cand


def fix_run(run, out, stats):
    """Sửa 1 run (toàn bộ ký tự đều trong miền mojibake) bằng prefix dài nhất."""
    n = len(run)
    # Short-circuit: run toàn ASCII → không thể là mojibake, giữ nguyên
    if all(ord(c) < 0x80 for c in run):
        out.append(run)
        return
    for cut in range(n, 1, -1):
        cand = try_reverse(run[:cut])
        if cand is not None:
            out.append(cand)
            stats['replaced'] += 1
            if cut < n:
                fix_run(run[cut:], out, stats)   # phần còn lại xử lý đệ quy
            return
    out.append(run)  # không đảo ngược được → giữ nguyên


def fix_text(text, stats):
    out = []
    i, n = 0, len(text)
    while i < n:
        if to_byte(text[i]) is not None:
            j = i
            while j < n and to_byte(text[j]) is not None:
                j += 1
            fix_run(text[i:j], out, stats)
            i = j
        else:
            out.append(text[i])
            i += 1
    return ''.join(out)


with open(PATH, 'rb') as f:
    raw = f.read()

has_bom = raw.startswith(b'\xef\xbb\xbf')
body = raw[3:] if has_bom else raw

text = body.decode('utf-8')
stats = {'replaced': 0}
fixed = fix_text(text, stats)

# Báo cáo — dấu hiệu mojibake: C1 control, chuỗi â€/Ã+Latin-1/ðŸ, và Ã¡-dạng (2-byte)
MOJI_BAD = re.compile(r'[\u0080-\u009f]|â€|ðŸ|Å|Æ|Ã[^\x00-\x7f]')
before = len(MOJI_BAD.findall(text))
after = len(MOJI_BAD.findall(fixed))
print('Dấu hiệu mojibake trước:', before, '| sau:', after, '| run đã sửa:', stats['replaced'])

samples = ['Tháng trước', 'Hôm nay', 'Tổng quan', 'Kế hoạch', 'Đặt lại', 'Đồng bộ',
           'Nhắc việc', '‹', '›', '🔔', 'Mục tiêu số 1']
missing = [s for s in samples if s not in fixed]
print('--- mẫu kiểm tra ---')
for s in samples:
    print(('OK ' if s in fixed else 'THIẾU ') + s)

if before == 0:
    print('ℹ️  Không có mojibake — file đã sạch, bỏ qua.')
    sys.exit(0)

if after > 0 or missing or stats['replaced'] == 0 or not fixed.lstrip().startswith('<!DOCTYPE'):
    print('⚠️  Vẫn còn dấu hiệu mojibake hoặc cấu trúc hỏng — không ghi file.')
    sys.exit(2)

out = (b'\xef\xbb\xbf' if has_bom else b'') + fixed.encode('utf-8')
with open(PATH, 'wb') as f:
    f.write(out)
print('✅ Đã ghi file đã sửa:', PATH, '| size', len(out), 'bytes')
