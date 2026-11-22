"""One-off importer: turns the Phase 1 crawl into content files.

Usage: python3 tools/import_from_wix.py <crawl-dir> <content-dir>

<crawl-dir> holds crawl.json and html/. Output is one Markdown file per URL,
with the page's metadata in the front matter exactly as crawled. Re-running
overwrites the files, so it is only safe before hand edits begin.
"""
import json, re, sys, hashlib
from pathlib import Path
from urllib.parse import urlsplit, unquote
from bs4 import BeautifulSoup, NavigableString, Tag

CRAWL, OUT = Path(sys.argv[1]), Path(sys.argv[2])
HOSTS = ("www.weddinglightingco.com", "weddinglightingco.com")
INLINE = {"span", "strong", "b", "em", "i", "u", "a", "br", "sup", "sub", "font", "wbr"}
SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "button", "nav", "input", "select", "textarea", "label", "video"}
SKIP_HOOKS = {"post-footer", "post-stats", "skeleton-loader", "category-dropdown", "time-ago", "post-main-actions-desktop",
              "post-main-actions-mobile", "user-name", "avatar-image", "gallery-item-image-img-preload",
              "post-header", "recent-posts", "comments", "post-list-item__title", "image-expand-button"}
MARKERS = {"post-list-root": "recent-posts", "recent-posts-root": "recent-posts"}


def rel(href):
    p = urlsplit(href)
    if p.scheme in ("http", "https") and p.netloc in HOSTS:
        path = p.path.rstrip("/") or "/"
        return path + (("?" + p.query) if p.query else "")
    return href


def esc(t):
    return re.sub(r"([\\`*_\[\]<>])", r"\\\1", t)


def inline(el):
    out = []
    for c in el.children:
        if isinstance(c, NavigableString):
            out.append(esc(str(c)))
        elif isinstance(c, Tag):
            if c.name == "br":
                out.append(" ")
            elif c.name in SKIP_TAGS:
                continue
            elif c.name == "a" and c.get("href"):
                t = inline(c).strip()
                if t:
                    out.append(f"[{t}]({rel(c['href'])})")
            elif c.name in ("strong", "b"):
                t = inline(c).strip()
                out.append(f"**{t}**" if t else "")
            elif c.name in ("em", "i"):
                t = inline(c).strip()
                out.append(f"*{t}*" if t else "")
            else:
                out.append(inline(c))
    return re.sub(r"\s+", " ", "".join(out)).replace("​", "").replace("\xa0", " ")


def media_id(src):
    m = re.search(r"wixstatic\.com/media/([^/?]+)", src or "")
    return m.group(1) if m else None


class Extract:
    def __init__(self):
        self.blocks, self.images, self.last_img, self.faq = [], [], None, False

    def add(self, kind, text):
        text = text.strip()
        if text and not (self.blocks and self.blocks[-1] == (kind, text)):
            self.blocks.append((kind, text))
            if kind != "img":
                self.last_img = None

    def image(self, im, href=None):
        mid = media_id(im.get("src") or im.get("data-src") or "")
        if not mid or mid == self.last_img:
            return
        self.last_img = mid
        alt = (im.get("alt") or "").strip()
        self.images.append({"id": mid, "alt": alt})
        md = f"![{esc(alt)}](wix:{mid})"
        self.blocks.append(("img", f"[{md}]({rel(href)})" if href else md))

    def walk(self, el):
        for c in el.children:
            if not isinstance(c, Tag):
                continue
            hook = c.get("data-hook") or c.get("data-testid") or ""
            if hook in SKIP_HOOKS or hook.startswith("widget-social"):
                continue
            if hook == "accordion-item-header":
                # FAQ accordion: the question is a heading inside a button.
                if not self.faq:
                    self.add("marker", "<!-- faq -->")
                    self.faq = True
                h = c.find(re.compile(r"^h[1-6]$"))
                if h is not None:
                    self.add("h", "#" * int(h.name[1]) + " " + inline(h).strip())
                continue
            if hook == "accordion-item-content":
                self.walk(c)
                continue
            if c.name in SKIP_TAGS or (c.get("aria-hidden") == "true" and c.name != "img"):
                # Off-screen gallery slides and image buttons hold real photos.
                if c.name in ("button", "div", "section"):
                    for im in c.find_all("img"):
                        if (im.get("data-hook") or "") not in SKIP_HOOKS:
                            self.image(im)
                continue
            if hook in MARKERS:
                self.add("marker", f"<!-- {MARKERS[hook]} -->")
                continue
            if c.name == "form":
                self.add("marker", "<!-- form -->")
                continue
            if c.name == "iframe":
                self.add("marker", f"<!-- embed {c.get('src') or c.get('data-src') or ''} -->")
                continue
            if re.fullmatch(r"h[1-6]", c.name):
                self.add("h", "#" * int(c.name[1]) + " " + inline(c).strip())
            elif c.name == "p":
                if c.find("img"):
                    self.walk(c)
                self.add("p", inline(c))
            elif c.name in ("ul", "ol"):
                items = [inline(li).strip() for li in c.find_all("li", recursive=False)]
                mark = (lambda i: f"{i + 1}.") if c.name == "ol" else (lambda i: "-")
                self.add("list", "\n".join(f"{mark(i)} {t}" for i, t in enumerate(items) if t))
            elif c.name == "blockquote":
                self.add("p", "> " + inline(c).strip())
            elif c.name == "img":
                self.image(c)
            elif c.name == "a" and c.get("href"):
                im = c.find("img")
                if im is not None:
                    self.image(im, c["href"])
                    t = inline(c).strip()
                    if t:
                        self.add("p", f"[{t}]({rel(c['href'])})")
                elif c.find(re.compile(r"^(h[1-6]|p|div)$")):
                    self.walk(c)
                else:
                    t = inline(c).strip()
                    if t:
                        self.add("link", f"[{t}]({rel(c['href'])})")
            elif c.name == "pre":
                self.add("p", inline(c))
            elif all((not isinstance(k, Tag)) or k.name in INLINE for k in c.children) and c.get_text(strip=True):
                self.add("p", inline(c))
            else:
                self.walk(c)


def template(path, rec):
    p = path.strip("/")
    if rec.get("title", "").startswith("404 Error"):
        return None
    if p == "":
        return "home"
    for pre, t in (("post/", "post"), ("product-page/", "product"), ("category/", "store-category"), ("catalog/", "catalog"),
                   ("blog/tags/", "blog-tag"), ("blog/categories/", "blog-category"), ("profile/", "profile")):
        if p.startswith(pre):
            return t
    if p == "blog":
        return "blog-index"
    if p in ("privacy-policy", "accessibility-statement"):
        return "legal"
    return "page"


def yaml_str(v):
    return json.dumps(v, ensure_ascii=False)


def main():
    recs = json.load(open(CRAWL / "crawl.json"))
    seen, n, report = set(), 0, []
    for r in recs:
        if r["status"] != 200 or r.get("redirect_chain") or "file" not in r:
            continue
        path = unquote(urlsplit(r["url"]).path).rstrip("/") or "/"
        if path in seen:
            continue
        tpl = template(path, r)
        if tpl is None:
            continue
        seen.add(path)
        soup = BeautifulSoup(open(CRAWL / "html" / r["file"], encoding="utf-8").read(), "lxml")
        root = soup.find("main") or soup.body
        if tpl == "post":
            root = root.find("article", attrs={"data-hook": "post"}) or root
        ex = Extract()
        ex.walk(root)
        fm = {"path": path, "template": tpl, "title": r["title"], "description": r["meta_description"], "canonical": r["canonical"],
              "robots": r["meta_robots"], "h1": r["h1"], "og": {k: v for k, v in (r.get("og") or {}).items() if k and v}}
        for s in soup.find_all("script", type="application/ld+json"):
            try:
                d = json.loads(s.string or "")
            except Exception:
                continue
            if isinstance(d, dict) and d.get("@type") in ("BlogPosting", "Product"):
                fm["schema"] = {k: d[k] for k in ("@type", "headline", "name", "description", "datePublished", "dateModified", "author", "sku", "brand") if k in d}
        main_el = soup.find("main") or soup.body
        links = []
        for a in main_el.find_all("a", href=True):
            h = rel(a["href"])
            if h.startswith(("/post/", "/product-page/")) and h not in links and h != path:
                links.append(unquote(h))
        if tpl in ("store-category", "blog-category", "blog-tag", "blog-index", "catalog"):
            fm["items"] = links
        if tpl in ("page", "home", "catalog") and any(k == "marker" and "recent-posts" in t for k, t in ex.blocks):
            fm["related"] = [l for l in links if l.startswith("/post/")][:3]
        if tpl == "post":
            fm["categories"] = sorted({unquote(rel(a["href"])) for a in main_el.find_all("a", href=True) if "/blog/categories/" in a["href"]})
            fm["tags"] = sorted({unquote(rel(a["href"])) for a in main_el.find_all("a", href=True) if "/blog/tags/" in a["href"]})
        if tpl == "post":
            # Reading time and "Updated" lines are generated by the template.
            ex.blocks = [b for b in ex.blocks if not re.fullmatch(r"(\d+ min read|Updated: .+)", b[1])]
        body = "\n\n".join(t for _, t in ex.blocks)
        words = len(re.sub(r"[#*\[\]()!<>-]|wix:\S+|\(/\S*\)", " ", body).split())
        report.append((path, tpl, r.get("word_count", 0), words, len(ex.images)))
        folder = {"post": "posts", "product": "products"}.get(tpl, "pages")
        name = (path.strip("/").replace("/", "__") or "index")
        if len(name) > 120:
            name = name[:100] + "-" + hashlib.md5(name.encode()).hexdigest()[:8]
        f = OUT / folder / f"{name}.md"
        f.parent.mkdir(parents=True, exist_ok=True)
        front = "\n".join(f"{k}: {yaml_str(v)}" for k, v in fm.items())
        f.write_text(f"---\n{front}\n---\n\n{body}\n", encoding="utf-8")
        n += 1
    json.dump(report, open(OUT / ".import-report.json", "w"))
    print(n, "files written")


main()
