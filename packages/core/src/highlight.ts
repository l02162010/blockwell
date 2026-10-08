/**
 * A deliberately small tokenizer for code blocks: comments, strings, numbers, keywords. It only
 * wraps text in `<span class="bw-tok-*">`, so DOM offsets still map 1:1 to the model text.
 */

const KEYWORDS: Record<string, string> = {
  js: 'async await break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield',
  ts: 'abstract as declare enum implements interface keyof namespace private protected public readonly type satisfies',
  python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
  rust: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
  csharp: 'abstract as async await base break case catch class const continue default delegate do else enum event explicit extern finally fixed for foreach get if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed set sizeof static struct switch this throw try typeof using var virtual void volatile while',
  java: 'abstract assert break case catch class const continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static super switch synchronized this throw throws try void volatile while var',
  sql: 'select from where and or not insert into values update set delete create table alter drop index join left right inner outer on group by order having limit offset as distinct union all case when then else end is in like between primary key foreign references',
  bash: 'if then else elif fi for while do done case esac function in return export local readonly',
  css: 'important',
};
const LITERALS = 'true false null undefined None True False nil NaN Infinity';

const families: Record<string, string[]> = {
  javascript: ['js'],
  typescript: ['js', 'ts'],
  json: [],
  python: ['python'],
  go: ['go'],
  rust: ['rust'],
  csharp: ['csharp'],
  java: ['java'],
  sql: ['sql'],
  bash: ['bash'],
  css: ['css'],
  yaml: [],
  html: [],
  markdown: [],
};

const hashComments = new Set(['python', 'bash', 'yaml']);

export interface Token {
  text: string;
  kind: 'keyword' | 'string' | 'number' | 'comment' | 'literal' | 'tag' | null;
}

/** CSS has no keywords to speak of: colour selectors, properties, values and at-rules instead. */
function tokenizeCss(text: string): Token[] {
  const re =
    /(\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(@[\w-]+)|(--?[A-Za-z_][\w-]*|[A-Za-z][\w-]*)(?=\s*:(?![^{]*\{))|([.#]?[A-Za-z_][\w-]*|[.#][\w-]+)(?=[^{};]*\{)|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)/g;
  const out: Token[] = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind: null });
    const kind: Token['kind'] = m[1] ? 'comment' : m[2] ? 'string' : m[3] || m[4] ? 'keyword' : m[5] ? 'tag' : 'number';
    out.push({ text: m[0], kind });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: null });
  return out;
}

export function tokenize(text: string, language: string): Token[] {
  if (language === 'css') return tokenizeCss(text);
  const fam = families[language];
  if (!fam) return [{ text, kind: null }];
  const words = new Set(fam.flatMap((f) => KEYWORDS[f]!.split(' ')));
  const lits = new Set(LITERALS.split(' '));
  const sqlish = language === 'sql';
  const comment = hashComments.has(language) ? '#[^\\n]*' : language === 'sql' ? '--[^\\n]*' : language === 'html' || language === 'markdown' ? '<!--[\\s\\S]*?-->' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
  const re = new RegExp(
    `(${comment})|("(?:[^"\\\\\\n]|\\\\.)*"?|'(?:[^'\\\\\\n]|\\\\.)*'?|\`(?:[^\`\\\\]|\\\\.)*\`?)|(\\b\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b|\\b0x[\\da-f]+\\b)|(</?[A-Za-z][\\w-]*)|([A-Za-z_$][\\w$]*)`,
    'gi',
  );
  const out: Token[] = [];
  let last = 0;
  const push = (t: string, kind: Token['kind']) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.kind === kind) prev.text += t;
    else out.push({ text: t, kind });
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    push(text.slice(last, m.index), null);
    if (m[1]) push(m[1], 'comment');
    else if (m[2]) push(m[2], 'string');
    else if (m[3]) push(m[3], 'number');
    else if (m[4]) push(m[4], language === 'html' ? 'tag' : null);
    else if (m[5]) {
      const w = m[5];
      push(w, words.has(sqlish ? w.toLowerCase() : w) ? 'keyword' : lits.has(w) ? 'literal' : null);
    }
    last = m.index + m[0].length;
  }
  push(text.slice(last), null);
  return out;
}
