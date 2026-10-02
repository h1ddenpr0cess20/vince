const INLINE = [
  { tag: 'code', re: /`([^`\n]+)`/ },
  { tag: 'strong', re: /\*\*(\S|\S[\s\S]*?\S)\*\*/ },
  { tag: 'strong', re: /__(\S|\S[\s\S]*?\S)__/ },
  { tag: 's', re: /~~(\S|\S[\s\S]*?\S)~~/ },
  { tag: 'em', re: /(?<![\w*])\*(\S|\S[\s\S]*?\S)\*(?!\w)/ },
  { tag: 'em', re: /(?<![\w_])_(\S|\S[\s\S]*?\S)_(?!\w)/ },
];

function firstSpan(text) {
  let found = null;
  for (const { tag, re } of INLINE) {
    const m = re.exec(text);
    if (m && (!found || m.index < found.at)) {
      found = { tag, at: m.index, width: m[0].length, body: m[1] };
    }
  }
  return found;
}

function render(text, into) {
  let rest = text;
  for (let span = firstSpan(rest); span; span = firstSpan(rest)) {
    if (span.at) into.append(rest.slice(0, span.at));
    const el = into.ownerDocument.createElement(span.tag);
    if (span.tag === 'code') el.append(span.body);
    else render(span.body, el);
    into.append(el);
    rest = rest.slice(span.at + span.width);
  }
  if (rest) into.append(rest);
  return into;
}

/** How many source links sit under a caption before the oldest gives way. */
const SOURCE_LIMIT = 6;

export function createHud(root = document) {
  const statusEl = root.querySelector('#status');
  const captionEl = root.querySelector('#caption');
  const youEl = root.querySelector('#you');

  const sourcesEl = captionEl.ownerDocument.createElement('div');
  sourcesEl.className = 'sources';
  sourcesEl.setAttribute('aria-label', 'Web sources');
  captionEl.after(sourcesEl);
  const sources = new Set();
  let turn = '';

  function draw() {
    captionEl.classList.remove('error');
    captionEl.classList.add('visible');
    captionEl.replaceChildren();
    render(turn, captionEl);
    captionEl.scrollTop = captionEl.scrollHeight;
  }

  return {
    setState(state) {
      statusEl.dataset.state = state;
      statusEl.textContent = state;
    },

    showUser(text) {
      youEl.textContent = text;
      youEl.classList.add('visible');
    },

    hideUser() {
      youEl.classList.remove('visible');
    },

    appendCaption(chunk) {
      turn += chunk;
      draw();
    },

    /**
     * The whole caption at once. A spoken row is re-sent in full on every
     * fragment, so it is replaced rather than appended to — appending would
     * repeat everything said so far, and clearing first would take the sources
     * down with it.
     */
    setCaption(text) {
      turn = text;
      draw();
    },

    clearCaption() {
      turn = '';
      captionEl.replaceChildren();
      captionEl.classList.remove('visible', 'error');
      /** The links belong to the answer above them, and it is gone. */
      sources.clear();
      sourcesEl.replaceChildren();
    },

    showSource({ url, title }) {
      let parsed;
      try { parsed = new URL(url); } catch { return; }
      if (!['https:', 'http:'].includes(parsed.protocol) || sources.has(parsed.href)) return;
      sources.add(parsed.href);
      const link = captionEl.ownerDocument.createElement('a');
      link.href = parsed.href;
      link.textContent = title || parsed.hostname;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      sourcesEl.append(link);
      /** Forgetting a trimmed link as well as removing it, so a later answer
       *  that cites it again still gets to show it. */
      while (sourcesEl.childElementCount > SOURCE_LIMIT) {
        const dropped = sourcesEl.firstElementChild;
        sources.delete(dropped.href);
        dropped.remove();
      }
    },

    showError(message) {
      turn = '';
      captionEl.textContent = message;
      captionEl.classList.add('visible', 'error');
    },
  };
}
