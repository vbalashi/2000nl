"""Render this article's deliberately simple Markdown using only the standard library."""
from pathlib import Path
from html import escape
import hashlib

folder = Path(__file__).resolve().parent
source = folder / 'article.ru.md'
text = source.read_text()
blocks = []
paragraph = 0
for block in text.strip().split('\n\n'):
    if block.startswith('# '):
        blocks.append('<h1>' + escape(block[2:]) + '</h1>')
    elif block.startswith('## '):
        blocks.append('<h2>' + escape(block[3:]) + '</h2>')
    else:
        paragraph += 1
        blocks.append(f'<p id="p{paragraph:02d}">' + escape(block.replace('\n', ' ')) + '</p>')
html = '''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Лето на карточки — первая редакция</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #faf8f3; color: #252622; }
main { max-width: 760px; padding: 36px 24px 80px; margin: auto; }
.review { font: 13px/1.6 system-ui, sans-serif; color: #68675f; border-bottom: 1px solid #dedbd2; padding-bottom: 20px; margin-bottom: 40px; }
article { font: 20px/1.75 Georgia, 'Times New Roman', serif; overflow-wrap: break-word; }
h1 { font-size: clamp(32px, 5vw, 46px); line-height: 1.16; font-weight: 500; margin: 0 0 36px; }
h2 { font-size: 27px; line-height: 1.3; margin: 44px 0 20px; }
p { margin: 0 0 22px; }
::selection { background: #e6d39c; color: #151510; }
@media (max-width: 520px) { main { padding: 24px 20px 60px; } article { font-size: 18px; } }
@media print { body { background: white; } .review { display: none; } main { max-width: none; padding: 0; } article { font-size: 12pt; } }
</style>
</head>
<body>
<main>
<div class="review">Рабочий текст · первая редакция · 13 октября 2026<br>Для чтения и отметок. Не опубликовано.</div>
<article>
''' + '\n'.join(blocks) + '''
</article>
</main>
</body>
</html>
'''
(folder / 'article.ru.html').write_text(html)
print(f'Rendered {paragraph} paragraphs; source SHA256 {hashlib.sha256(source.read_bytes()).hexdigest()}')
