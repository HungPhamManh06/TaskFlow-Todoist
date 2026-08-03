# -*- coding: utf-8 -*-
"""
OCR ảnh — tự chọn engine phù hợp nhất trên máy của bạn.

Thứ tự ưu tiên (engine `auto`, mặc định):
    1. Windows OCR tiếng Việt (Windows.Media.Ocr qua winsdk) — nhanh, sẵn có
    2. easyocr (['vi','en']) — chất lượng cao nhất, chậm hơn, cần pip install

Cách dùng:
    py -3.12 scripts/ocr-image.py <đường-dẫn-ảnh> [ảnh2 ảnh3 ...]
    py -3.12 scripts/ocr-image.py ảnh.png -o ket-qua.txt     # ghi ra file UTF-8
    py -3.12 scripts/ocr-image.py ảnh.png --engine easyocr    # ép dùng easyocr
    py -3.12 scripts/ocr-image.py ảnh.png --engine windows    # ép dùng Windows OCR

Yêu cầu:
    - Python 3.12. Cài các gói:
        py -3.12 -m pip install winsdk        # engine Windows (tuỳ chọn)
        py -3.12 -m pip install easyocr       # engine neural (khuyến nghị cho tiếng Việt)
    - Lần chạy đầu của easyocr sẽ tải model (~100MB) rồi cache lại.

Mã thoát:
    0  thành công (mọi ảnh đã xử lý)
    1  lỗi (thiếu engine / file không tồn tại)
"""

import argparse
import asyncio
import os
import sys


# ---------------------------------------------------------------- Windows OCR

def winsdk_has_vietnamese():
    """Windows OCR có hỗ trợ tiếng Việt không? (cần language pack vi-VN)"""
    try:
        from winsdk.windows.media.ocr import OcrEngine
        from winsdk.windows.globalization import Language
        vi = Language("vi-VN")
        return OcrEngine.is_language_supported(vi)
    except Exception:
        return False


def check_winsdk():
    """Kiểm tra winsdk import được không."""
    try:
        from winsdk.windows.media.ocr import OcrEngine  # noqa: F401
        return True
    except ImportError:
        return False


async def ocr_windows(path, out):
    """OCR bằng Windows.Media.Ocr (trả số lỗi: 0 = OK, 1 = lỗi)."""
    from winsdk.windows.graphics.imaging import BitmapDecoder
    from winsdk.windows.media.ocr import OcrEngine
    from winsdk.windows.globalization import Language
    from winsdk.windows.storage import FileAccessMode, StorageFile

    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        out.write(f"!! Không tìm thấy file: {path}\n")
        return 1

    file = await StorageFile.get_file_from_path_async(abs_path)
    stream = await file.open_async(FileAccessMode.READ)
    decoder = await BitmapDecoder.create_async(stream)
    bitmap = await decoder.get_software_bitmap_async()

    # Ưu tiên tiếng Việt, fallback theo ngôn ngữ hệ thống
    engine = None
    try:
        vi_lang = Language("vi-VN")
        if OcrEngine.is_language_supported(vi_lang):
            engine = OcrEngine.try_create_from_language(vi_lang)
            out.write("(engine: Windows OCR vi-VN)\n")
    except Exception:
        pass
    if engine is None:
        engine = OcrEngine.try_create_from_user_profile_languages()
        out.write("(engine: Windows OCR — ngôn ngữ hệ thống, dấu tiếng Việt "
                  "có thể lệch; dùng --engine easyocr để đọc chuẩn)\n")

    if engine is None:
        out.write("!! Không tạo được Windows OCR engine\n")
        return 1

    result = await engine.recognize_async(bitmap)
    count = 0
    for line in result.lines:
        count += 1
        out.write(f"{count:3}| {line.text}\n")
    out.write(f"--- {count} dòng ---\n")
    return 0


# ------------------------------------------------------------------- easyocr

_READER = None


def _get_reader():
    """Khởi tạo easyocr.Reader một lần rồi dùng lại (chậm lần đầu)."""
    global _READER
    if _READER is None:
        import easyocr
        _READER = easyocr.Reader(["vi", "en"], gpu=False, verbose=False)
    return _READER


def check_easyocr():
    """Kiểm tra easyocr import được không."""
    try:
        import easyocr  # noqa: F401
        return True
    except ImportError:
        return False


def _sort_lines(results):
    """Sắp xếp các dòng theo thứ tự đọc: từ trên xuống, trái qua phải."""
    def key(item):
        bbox = item[0]
        top = min(p[1] for p in bbox)
        left = min(p[0] for p in bbox)
        # Nhóm các dòng cùng hàng (sai lệch < 12px) giữ thứ tự trái → phải
        return (round(top / 12), left)
    return sorted(results, key=key)


def ocr_easyocr(path, out, min_conf=0.2):
    """OCR bằng easyocr (trả số lỗi: 0 = OK, 1 = lỗi)."""
    abs_path = os.path.abspath(path)
    if not os.path.exists(abs_path):
        out.write(f"!! Không tìm thấy file: {path}\n")
        return 1

    reader = _get_reader()
    results = reader.readtext(abs_path, detail=1, paragraph=False)
    results = [r for r in results if r[2] >= min_conf]
    results = _sort_lines(results)

    count = 0
    for bbox, text, conf in results:
        count += 1
        out.write(f"{count:3}| {text}   (conf {conf:.2f})\n")
    out.write(f"--- {count} dòng ---\n")
    return 0


# ---------------------------------------------------------------------- main

def main():
    parser = argparse.ArgumentParser(
        description="OCR ảnh — tự chọn engine: Windows OCR (vi-VN nếu có) "
                    "hoặc easyocr (vi/en).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Ví dụ:\n  py -3.12 scripts/ocr-image.py app-screenshot.png\n"
               "  py -3.12 scripts/ocr-image.py a.png b.png -o out.txt\n"
               "  py -3.12 scripts/ocr-image.py a.png --engine easyocr",
    )
    parser.add_argument("images", nargs="+", help="Đường dẫn 1 hoặc nhiều ảnh")
    parser.add_argument("-o", "--output", metavar="FILE",
                        help="Ghi kết quả vào file UTF-8 (mặc định: stdout)")
    parser.add_argument("--engine", choices=["auto", "windows", "easyocr"],
                        default="auto",
                        help="Chọn engine OCR (mặc định: auto)")
    parser.add_argument("--min-conf", type=float, default=0.2, metavar="0-1",
                        help="Bỏ dòng có độ tin cậy < ngưỡng này (easyocr, "
                             "mặc định 0.2)")
    args = parser.parse_args()

    if not args.output:
        # Chạy UTF-8 kể cả khi console Windows mặc định là cp1252
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    stream = open(args.output, "w", encoding="utf-8") if args.output else sys.stdout

    exit_codes = []
    try:
        for img in args.images:
            engine = args.engine
            if engine == "auto":
                if check_winsdk() and winsdk_has_vietnamese():
                    engine = "windows"
                elif check_easyocr():
                    engine = "easyocr"
                else:
                    out_msg = ("Không có engine nào sẵn sàng.\n"
                               "  - Windows OCR: py -3.12 -m pip install winsdk "
                               "(và cài language pack OCR vi-VN trong Settings)\n"
                               "  - easyocr:     py -3.12 -m pip install easyocr\n")
                    stream.write(out_msg)
                    exit_codes.append(1)
                    continue

            abs_path = os.path.abspath(img)
            if not os.path.exists(abs_path):
                stream.write(f"\n!! Không tìm thấy file: {img}\n")
                exit_codes.append(1)
                continue

            stream.write(f"\n===== {os.path.basename(abs_path)} (engine: {engine}) =====\n")
            if engine == "easyocr":
                code = ocr_easyocr(abs_path, stream, args.min_conf)
            else:
                code = asyncio.run(ocr_windows(abs_path, stream))
            exit_codes.append(code)
    finally:
        if args.output:
            stream.close()

    return 1 if any(exit_codes) else 0


if __name__ == "__main__":
    sys.exit(main())
