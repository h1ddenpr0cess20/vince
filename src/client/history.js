export const KEY = 'vince.history.v1';

const LIMIT = 40;
const BUDGET = 300_000;
/** How long a rewritten row waits before the log is serialised again. */
const COALESCE_MS = 250;
const PROBE = `${KEY}.probe`;

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

export function defaultStorage() {
  try {
    const store = globalThis.localStorage;
    store.setItem(PROBE, '1');
    store.removeItem(PROBE);
    return store;
  } catch {
    return memoryStorage();
  }
}

function newId(startedAt) {
  return `c${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function valid(conversation) {
  return Boolean(
    conversation
    && typeof conversation.id === 'string'
    && Number.isFinite(conversation.startedAt)
    && Array.isArray(conversation.messages)
    && conversation.messages.every((m) => m && typeof m.content === 'string'),
  );
}

export function createHistory({
  storage = defaultStorage(),
  key = KEY,
  limit = LIMIT,
  budget = BUDGET,
  coalesceMs = COALESCE_MS,
  now = Date.now,
} = {}) {
  let conversations = load();
  let open = null;
  const listeners = new Set();

  function load() {
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? 'null');
      if (parsed?.version !== 1 || !Array.isArray(parsed.conversations)) return [];
      return parsed.conversations.filter(valid);
    } catch {
      return [];
    }
  }

  function save() {
    for (;;) {
      if (conversations.length > limit) {
        conversations.pop();
        continue;
      }
      const body = JSON.stringify({ version: 1, conversations });
      if (body.length > budget && conversations.length > 1) {
        conversations.pop();
        continue;
      }
      try {
        storage.setItem(key, body);
      } catch {
        if (conversations.length > 1) {
          conversations.pop();
          continue;
        }
      }
      return;
    }
  }

  function changed() {
    for (const listener of listeners) listener();
  }

  /**
   * A spoken row is rewritten on every fragment that lands in it, and a write
   * is the whole log serialised. Held for a moment so a sentence costs one
   * write rather than one per word; anything structural flushes first, and so
   * does the end of a call, which is the last thing every teardown path does.
   */
  let waiting = null;
  function saveSoon() {
    waiting ??= setTimeout(() => { waiting = null; save(); changed(); }, coalesceMs);
  }
  function settle() {
    if (waiting === null) return false;
    clearTimeout(waiting);
    waiting = null;
    return true;
  }
  function flush() {
    if (settle()) { save(); changed(); }
  }

  function begin({ model, voice } = {}) {
    end();
    open = { id: newId(now()), startedAt: now(), endedAt: null, model, voice, messages: [] };
    return open;
  }

  function append(message) {
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!content) return null;

    const existing = message.id && open?.messages.find((m) => m.id === message.id);
    if (existing) {
      Object.assign(existing, {
        content, fragments: message.fragments, start_ms: message.start_ms, end_ms: message.end_ms,
      });
      saveSoon();
      return existing;
    }
    const turn = { ...(message.id ? { id: message.id, fragments: message.fragments, start_ms: message.start_ms, end_ms: message.end_ms } : {}), role: message.role === 'assistant' ? 'assistant' : 'user', content, at: now() };
    settle();
    open ??= begin();
    if (!conversations.includes(open)) conversations.unshift(open);
    open.messages.push(turn);
    open.endedAt = turn.at;

    save();
    changed();
    return turn;
  }

  function end() {
    flush();
    if (!open) return null;
    const closed = open;
    open = null;
    if (closed.messages.length) changed();
    return closed;
  }

  /**
   * Opens a stored conversation back up, so what is said next lands in it
   * instead of in a new entry. It moves to the top of the list on the way,
   * where the one being talked in belongs.
   */
  function resume(id) {
    flush();
    const at = conversations.findIndex((c) => c.id === id);
    if (at < 0) return null;

    end();
    open = conversations[at];
    conversations.splice(at, 1);
    conversations.unshift(open);
    save();
    changed();
    return { ...open, messages: [...open.messages] };
  }

  return {
    begin,
    append,
    end,
    resume,
    /** Writes a held update out now. Every teardown path reaches it via `end`. */
    flush,

    get conversations() {
      return conversations.map((c) => ({ ...c, messages: [...c.messages] }));
    },

    get live() {
      return open?.id ?? null;
    },

    remove(id) {
      settle();
      const at = conversations.findIndex((c) => c.id === id);
      if (at < 0) return false;
      if (conversations[at] === open) open = null;
      conversations.splice(at, 1);
      save();
      changed();
      return true;
    },

    clear() {
      settle();
      conversations = [];
      open = null;
      try {
        storage.removeItem(key);
      } catch {}
      changed();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
