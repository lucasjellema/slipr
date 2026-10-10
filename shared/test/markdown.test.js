import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { markdown, markdownInline, markdownListItems, markdownToText, escape } from '../markdown.js';

const glossary = { 'reveal-js': { term: 'Reveal.js' }, slot: { term: 'slot' } };
const reader = { mode: 'reader', glossary };
const audience = { mode: 'audience', glossary };

describe('inline formatting', () => {
  test('bold, italic, code', () => {
    assert.equal(markdownInline('**bold** and *it* and _also_ and `x < y`'),
      '<strong>bold</strong> and <em>it</em> and <em>also</em> and <code>x &lt; y</code>');
  });

  test('single-character emphasis and no false positives', () => {
    assert.equal(markdownInline('*a* 5 * 3 * 2 snake_case_name'), '<em>a</em> 5 * 3 * 2 snake_case_name');
  });

  test('backslash escapes', () => {
    assert.equal(markdownInline('\\*not italic\\* and \\[\\[no-term\\]\\]'), '*not italic* and [[no-term]]');
  });

  test('code spans are literal', () => {
    assert.equal(markdownInline('`**not bold** [x](y)`'), '<code>**not bold** [x](y)</code>');
  });
});

describe('safety', () => {
  test('HTML in source is escaped', () => {
    assert.equal(markdownInline('<img src=x onerror=alert(1)> & "q"'),
      '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;');
  });

  test('dangerous link schemes are dropped, text kept', () => {
    assert.equal(markdownInline('[click](javascript:alert(1))'), 'click');
    assert.equal(markdownInline('[x](data:text/html,hi)'), 'x');
  });

  test('link URLs are attribute-escaped', () => {
    assert.equal(markdownInline('[x](https://a.b/?q="1"&r=2)'),
      '<a href="https://a.b/?q=&quot;1&quot;&amp;r=2" target="_blank" rel="noopener noreferrer">x</a>');
  });

  test('NUL characters cannot forge placeholders', () => {
    assert.equal(markdownInline('a\u00000\u0000b'), 'a0b');
  });

  test('escape()', () => {
    assert.equal(escape(`<a href='x'>&</a>`), '&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;');
  });
});

describe('links', () => {
  test('relative links have no target', () => {
    assert.equal(markdownInline('[spec](docs/show-format.md)'), '<a href="docs/show-format.md">spec</a>');
  });

  test('slide links get data-slide-link and a custom href', () => {
    assert.equal(markdownInline('[arch](#s-architecture)'), '<a href="#s-architecture" data-slide-link="s-architecture">arch</a>');
    assert.equal(markdownInline('[b](#s-2/b3)', { slideHref: (id) => `?mode=reader#${id}` }),
      '<a href="?mode=reader#s-2/b3" data-slide-link="s-2">b</a>');
  });

  test('formatting inside link text', () => {
    assert.equal(markdownInline('[**bold** link](https://x.y)'),
      '<a href="https://x.y" target="_blank" rel="noopener noreferrer"><strong>bold</strong> link</a>');
  });
});

describe('Slipr extensions', () => {
  test('glossary references: plain text in audience mode', () => {
    assert.equal(markdownInline('Uses [[reveal-js]] and [[slot|slots]].', audience), 'Uses Reveal.js and slots.');
  });

  test('glossary references: buttons in reader mode', () => {
    assert.equal(markdownInline('[[reveal-js]]', reader),
      '<button type="button" class="slipr-term" data-term="reveal-js">Reveal.js</button>');
  });

  test('unknown glossary id falls back to the id', () => {
    assert.equal(markdownInline('[[nope]]', audience), 'nope');
  });

  test('popups are dropped in audience mode', () => {
    assert.equal(markdownInline('later^[after the event], and', audience), 'later, and');
  });

  test('popups become numbered markers in reader mode, with inline content and nested brackets', () => {
    const html = markdownInline('a^[see [docs](https://d.e)] b^[*two*]', reader);
    assert.match(html, /<button type="button" class="slipr-footnote-ref" data-footnote="1" aria-label="Note 1">1<\/button>/);
    assert.match(html, /<span class="slipr-footnote" data-footnote="1" hidden>see <a href="https:\/\/d.e"/);
    assert.match(html, /data-footnote="2" hidden><em>two<\/em><\/span>/);
  });

  test('footnote numbering continues across a whole block render', () => {
    const html = markdown('one^[a]\n\ntwo^[b]', reader);
    assert.match(html, /aria-label="Note 2"/);
  });
});

describe('blocks', () => {
  test('paragraphs and line breaks', () => {
    assert.equal(markdown('Line one\nline two\n\nSecond para'), '<p>Line one<br>line two</p>\n<p>Second para</p>');
  });

  test('nested bullet list', () => {
    assert.equal(markdown('- one\n  - nested\n  - nested 2\n- two'),
      '<ul><li>one<ul><li>nested</li><li>nested 2</li></ul></li><li>two</li></ul>');
  });

  test('three levels and dedent to the middle', () => {
    assert.equal(markdown('- a\n  - b\n    - c\n  - d\n- e'),
      '<ul><li>a<ul><li>b<ul><li>c</li></ul></li><li>d</li></ul></li><li>e</li></ul>');
  });

  test('numbered list and continuation lines', () => {
    assert.equal(markdown('1. first\n   continues\n2. second'), '<ol><li>first continues</li><li>second</li></ol>');
  });

  test('paragraph followed by a list', () => {
    assert.equal(markdown('Intro:\n- a\n- b'), '<p>Intro:</p>\n<ul><li>a</li><li>b</li></ul>');
  });

  test('fenced code block keeps content literal', () => {
    assert.equal(markdown('```json\n{ "a": "<b>" }\n**x**\n```'),
      '<pre><code class="language-json">{ &quot;a&quot;: &quot;&lt;b&gt;&quot; }\n**x**</code></pre>');
  });

  test('letter lists: A. / a) become ordered lists with a type', () => {
    assert.equal(markdown('A. first\nB. second'), '<ol type="A"><li>first</li><li>second</li></ol>');
    assert.equal(markdown('a) one\nb) two'), '<ol type="a"><li>one</li><li>two</li></ol>');
    assert.equal(markdown('1. x\n  a. nested'), '<ol><li>x<ol type="a"><li>nested</li></ol></li></ol>');
  });

  test('an entirely bold paragraph is a subheading', () => {
    assert.equal(markdown('**Key findings**\n\nText'), '<p class="slipr-md-subheading"><strong>Key findings</strong></p>\n<p>Text</p>');
    assert.equal(markdown('**Bold** and more'), '<p><strong>Bold</strong> and more</p>', 'partly bold is not a subheading');
    assert.equal(markdown('**a** and **b**'), '<p><strong>a</strong> and <strong>b</strong></p>');
    assert.equal(markdown('**two**\nlines'), '<p><strong>two</strong><br>lines</p>', 'only one-line paragraphs');
  });

  test('CRLF input', () => {
    assert.equal(markdown('- a\r\n- b'), '<ul><li>a</li><li>b</li></ul>');
  });
});

describe('list slots', () => {
  test('Markdown list string to <li> elements', () => {
    assert.equal(markdownListItems('- **a**\n  - b\n- c'), '<li><strong>a</strong><ul><li>b</li></ul></li><li>c</li>');
  });

  test('lenient: plain lines become items', () => {
    assert.equal(markdownListItems('first\nsecond'), '<li>first</li><li>second</li>');
  });

  test('array of strings', () => {
    assert.equal(markdownListItems(['one', '*two*']), '<li>one</li><li><em>two</em></li>');
  });
});

describe('markdownToText', () => {
  test('strips formatting, resolves glossary, drops popups', () => {
    assert.equal(markdownToText('**Hi** [[reveal-js]]^[x] & [link](https://a.b)\n- item', { glossary }),
      'Hi Reveal.js & link\nitem');
  });
});
