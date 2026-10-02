/**
 * Stands in for `codex` — same flags, same output shape, no model behind it.
 * Which agent it is playing comes first on the command line, and what it does
 * comes from the task text itself:
 *
 *   ...fail     writes to stderr and exits non-zero
 *   ...sleep    stays up until it is killed
 *   ...quiet    exits cleanly having said nothing
 *   ...where    reports the directory it was actually started in
 */
const [, ...argv] = process.argv.slice(2);

/** Codex takes the task last, behind its flags. */
const task = argv[argv.length - 1];

/** One finished answer, in the machine format it speaks. */
function said(text) {
  return JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } });
}

if (/\bfail\b/.test(task)) {
  process.stderr.write('the build is on fire\n');
  process.exit(3);
}

if (/\bsleep\b/.test(task)) {
  setInterval(() => {}, 1000);
} else if (/\bquiet\b/.test(task)) {
  process.exit(0);
} else if (/\bwhere\b/.test(task)) {
  process.stdout.write(`${said(`cwd=${process.cwd()} PWD=${process.env.PWD} key=${process.env.OPENAI_API_KEY}`)}\n`);
} else {
  const lines = [
    { type: 'thread.started', thread_id: 'fake-thread' },
    { type: 'item.completed', item: { type: 'reasoning', text: 'thinking about it' } },
    { type: 'item.completed', item: { type: 'agent_message', text: `codex did: ${task}` } },
    { type: 'turn.completed', usage: { input_tokens: 12, output_tokens: 34 } },
  ];
  process.stdout.write(`${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
}
