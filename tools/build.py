#!/usr/bin/env python3
"""GitHub Pages는 Cache-Control: max-age=600을 주므로, 파일이 바뀔 때마다
?v=<content hash>를 붙여 브라우저가 즉시 새 버전을 받도록 한다.

사용: python3 tools/build.py
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
JS_DIR = ROOT / "js"

VER_RE = re.compile(r"\?v=[0-9a-f]{8}")


def strip_versions(text: str) -> str:
    return VER_RE.sub("", text)


def main() -> None:
    js_files = sorted(JS_DIR.glob("*.js"))
    html_path = ROOT / "index.html"

    # 1) 버전 제거한 내용으로 해시 계산
    stripped = {}
    for f in js_files:
        stripped[f] = strip_versions(f.read_text(encoding="utf-8"))
    html = strip_versions(html_path.read_text(encoding="utf-8"))
    css = strip_versions((ROOT / "style.css").read_text(encoding="utf-8"))

    h = hashlib.md5()
    for f in js_files:
        h.update(stripped[f].encode("utf-8"))
    h.update(html.encode("utf-8"))
    h.update(css.encode("utf-8"))
    ver = h.hexdigest()[:8]

    # 2) JS 모듈 import에 버전 부여
    import_re = re.compile(r"""(from\s+|import\()(['"])(\./[A-Za-z0-9_\-]+\.js)\2""")
    changed = 0
    for f in js_files:
        src = stripped[f]
        new = import_re.sub(lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}?v={ver}{m.group(2)}", src)
        if new != f.read_text(encoding="utf-8"):
            f.write_text(new, encoding="utf-8")
            changed += 1

    # 3) HTML의 진입 스크립트 / 스타일시트에 버전 부여
    html_new = html.replace('src="js/app.js"', f'src="js/app.js?v={ver}"')
    html_new = html_new.replace('href="style.css"', f'href="style.css?v={ver}"')
    if html_new != html_path.read_text(encoding="utf-8"):
        html_path.write_text(html_new, encoding="utf-8")

    print(f"version={ver} · js files updated={changed}")


if __name__ == "__main__":
    main()
