"""DOM-level audit: layout metrics + contrast ratios."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8090"

def lum(hexc):
    def ch(h):
        v = int(h, 16) / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = ch(hexc[1:3]), ch(hexc[3:5]), ch(hexc[5:7])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})

    pg.goto(f"{BASE}/index.html")
    pg.wait_for_timeout(1200)
    print("== LANDING ==")
    r = pg.evaluate("""() => {
      const q = s => document.querySelector(s);
      const hero = q('.lp-hero');
      const cta = q('.lp-cta-row');
      const btns = [...cta.children].map(el => ({txt: el.textContent.trim().replace(/[^\\x00-\\x7F]/g,'').slice(0,20), w: Math.round(el.getBoundingClientRect().width)}));
      const heroRect = hero.getBoundingClientRect();
      const h1 = q('.lp-title');
      const titleH = Math.round(h1.getBoundingClientRect().height);
      const titleFs = getComputedStyle(h1).fontSize;
      const sub = q('.lp-sub');
      const subH = Math.round(sub.getBoundingClientRect().height);
      const subFs = getComputedStyle(sub).fontSize;
      const subWords = sub.textContent.trim().split(/\\s+/).length;
      return {
        heroW: Math.round(heroRect.width), heroH: Math.round(heroRect.height),
        ctaBtns: btns, titleH, titleFs, subH, subFs, subWords,
        headerH: Math.round(q('.lp-header').getBoundingClientRect().height),
        navOneline: q('.lp-nav').getBoundingClientRect().height < 40,
        colors: {
          inkSoft: getComputedStyle(document.body).getPropertyValue('--ink-soft').trim(),
          bg: getComputedStyle(document.body).getPropertyValue('--bg').trim(),
          accentDeep: getComputedStyle(document.body).getPropertyValue('--accent-deep').trim(),
        }
      };
    }""")
    print(r)
    cs = r["colors"]
    print("contrast inkSoft/bg:", round(contrast(cs["inkSoft"], cs["bg"]), 2))
    print("contrast accentDeep/bg:", round(contrast(cs["accentDeep"], cs["bg"]), 2))

    # features grid
    print(pg.evaluate("""() => {
      const f = document.querySelectorAll('.lp-feature');
      const first = f[0].getBoundingClientRect();
      const second = f[1].getBoundingClientRect();
      return {count: f.length, sameRow: Math.round(first.top) === Math.round(second.top),
              gap: Math.round(second.left - first.right)};
    }"""))

    pg.goto(f"{BASE}/app.html")
    pg.wait_for_timeout(1500)
    print("== APP ==")
    print(pg.evaluate("""() => {
      const q = s => document.querySelector(s);
      const hdr = q('.site-header');
      const h1 = q('.brand-text h1');
      return {
        headerH: Math.round(hdr.getBoundingClientRect().height),
        headerRows: [...hdr.children].filter(c => c.getBoundingClientRect().top > hdr.getBoundingClientRect().top + 5).length + 1,
        brandFont: getComputedStyle(h1).fontFamily.split(',')[0].trim(),
        brandSize: getComputedStyle(h1).fontSize,
        tabsVisible: [...q('#navTabs').children].filter(t => t.getBoundingClientRect().right <= 1440).length,
        tabCount: q('#navTabs').children.length,
        nowBox: q('#nowBox') ? Math.round(q('#nowBox').getBoundingClientRect().height) : null,
      };
    }"""))

    # mobile
    pg.set_viewport_size({"width": 390, "height": 844})
    pg.wait_for_timeout(600)
    print("== APP MOBILE ==")
    print(pg.evaluate("""() => {
      const hdr = document.querySelector('.site-header');
      const rows = new Set();
      [...hdr.children].forEach(c => rows.add(Math.round(c.getBoundingClientRect().top - hdr.getBoundingClientRect().top)));
      return {headerH: Math.round(hdr.getBoundingClientRect().height), rowCount: rows.size};
    }"""))
    b.close()
