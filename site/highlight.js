// A tiny syntax highlighter for the snippets on this site (JS, HTML, plain text). One regex per
// language; each capture group is a token class. It builds DOM nodes rather than HTML strings,
// so snippet text is never interpreted as markup.
const KEYWORDS = new Set(['import', 'from', 'export', 'const', 'let', 'var', 'function', 'return', 'new', 'if', 'else', 'for', 'of', 'in', 'await', 'async', 'class', 'this', 'true', 'false', 'null', 'undefined']);

const STRING = `'(?:[^'\\\\\\n]|\\\\.)*'|"(?:[^"\\\\\\n]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\``;

const LANGS = {
  js: {
    // comment | string | number | call | property | word
    re: new RegExp(`(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)|(${STRING})|(\\b\\d+(?:\\.\\d+)?\\b)|(\\b[A-Za-z_$][\\w$]*(?=\\())|(\\b[A-Za-z_$][\\w$]*(?=\\s*:))|(\\b[A-Za-z_$][\\w$]*\\b)`, 'g'),
    classes: ['comment', 'string', 'number', 'function', 'property', 'word'],
  },
  html: {
    // comment | tag | attribute | string
    re: new RegExp(`(<!--[\\s\\S]*?-->)|(<\\/?[A-Za-z][\\w-]*|\\/?>)|([A-Za-z-]+(?==))|(${STRING})`, 'g'),
    classes: ['comment', 'tag', 'attr', 'string'],
  },
};

export function highlight(src, lang = 'js') {
  const frag = document.createDocumentFragment();
  const spec = LANGS[lang];
  if (!spec) { frag.append(src); return frag; }

  let last = 0;
  for (const m of src.matchAll(spec.re)) {
    const i = m.slice(1).findIndex((g) => g !== undefined);
    let cls = spec.classes[i];
    if (cls === 'word') cls = KEYWORDS.has(m[0]) ? 'keyword' : null;
    if (m.index > last) frag.append(src.slice(last, m.index));
    if (cls) {
      const span = document.createElement('span');
      span.className = `tok-${cls}`;
      span.textContent = m[0];
      frag.append(span);
    } else frag.append(m[0]);
    last = m.index + m[0].length;
  }
  if (last < src.length) frag.append(src.slice(last));
  return frag;
}
