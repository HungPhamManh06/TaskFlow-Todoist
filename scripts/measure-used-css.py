"""TEMP (delete after use): measure which css/styles.css rules match the boot DOM.

Loads /app.html at desktop + mobile viewports, walks a constructable stylesheet
built from css/styles.css source, and classifies every rule as:
  used        - selector matches an element in the live DOM
  interaction - selector matches only after stripping interaction pseudo-classes
                (:hover/:focus/:active/...), i.e. an interaction state of a
                present element
  unused      - matches nothing at boot
Keyframes referenced by used/interaction rules are also flagged.
"""
import http.server
import json
import os
import socketserver
import threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{httpd.server_address[1]}"

JS = r"""
async () => {
  const css = await (await fetch('css/styles.css')).text();
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);

  const INTERACTION = /:(hover|focus|active|focus-visible|focus-within|visited|checked|disabled|placeholder-shown|link|target)(\([^)]*\))?/g;

  function stripPseudoEl(sel) {
    return sel.replace(/::[\w-]+(\([^)]*\))?/g, '');
  }
  function matches(sel) {
    try { return document.querySelectorAll(sel).length > 0; } catch (e) {
      const s2 = stripPseudoEl(sel);
      try { return document.querySelectorAll(s2).length > 0; } catch (e2) { return null; }
    }
  }
  function stripInteraction(sel) {
    return sel.replace(INTERACTION, '');
  }

  const used = new Set();
  const interaction = new Set();
  const keyframes = new Set();   // animation names referenced by used rules
  const keyframeDefs = new Set();// animation names defined in the sheet

  function walk(rules) {
    for (const r of rules) {
      if (r.type === CSSRule.STYLE_RULE) {
        const m = matches(r.selectorText);
        if (m === true) {
          used.add(r.selectorText);
          const anim = (r.style.animationName || '').trim();
          if (anim && anim !== 'none') keyframes.add(anim);
        } else if (m === null) {
          // un-queryable selector (e.g. weird pseudo) — keep conservatively
          used.add(r.selectorText);
        } else {
          const sm = stripInteraction(r.selectorText);
          if (sm !== r.selectorText) {
            const m2 = matches(sm);
            if (m2 === true || m2 === null) interaction.add(r.selectorText);
          }
        }
      } else if (r.type === CSSRule.KEYFRAMES_RULE) {
        keyframeDefs.add(r.name);
      } else if (r.cssRules) {
        walk(r.cssRules);
      }
    }
  }
  walk(sheet.cssRules);

  const neededKf = [...keyframes].filter((k) => keyframeDefs.has(k));
  return { used: [...used], interaction: [...interaction], keyframes: neededKf, viewport: window.innerWidth + 'x' + window.innerHeight };
}
"""

with sync_playwright() as p:
    out = {}
    # Desktop pass
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    pg.emulate_media(reduced_motion="reduce")
    pg.add_init_script("localStorage.setItem('planner-onboarded','1');")
    pg.goto(f"{base}/app.html", wait_until="networkidle")
    pg.wait_for_timeout(400)
    out["desktop"] = pg.evaluate(JS)
    pg.close()

    # Mobile pass (touch / coarse pointer to activate hover:none media rules)
    mp = b.new_page(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    mp.emulate_media(reduced_motion="reduce")
    mp.add_init_script("localStorage.setItem('planner-onboarded','1');")
    mp.goto(f"{base}/app.html", wait_until="networkidle")
    mp.wait_for_timeout(400)
    out["mobile"] = mp.evaluate(JS)
    mp.close()
    b.close()

    used = set(out["desktop"]["used"]) | set(out["mobile"]["used"])
    inter = set(out["desktop"]["interaction"]) | set(out["mobile"]["interaction"])
    kf = set(out["desktop"]["keyframes"]) | set(out["mobile"]["keyframes"])
    res = {
        "desktop": out["desktop"]["viewport"],
        "mobile": out["mobile"]["viewport"],
        "used": sorted(used),
        "interaction": sorted(inter - used),
        "keyframes": sorted(kf),
        "counts": {"used": len(used), "interaction": len(inter - used), "keyframes": len(kf)},
    }
    with open("docs/lighthouse/used-css.json", "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(json.dumps(res["counts"], ensure_ascii=False))
    print("desktop viewport:", res["desktop"], "| mobile viewport:", res["mobile"])
