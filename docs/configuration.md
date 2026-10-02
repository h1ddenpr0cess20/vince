# Configuration

Both `npm run dev` and `npm start` read `.env`.

| Variable | Default | Role |
|---|---|---|
| `OPENAI_API_KEY` | — | Required. Stays in the Node process. |
| `MEMORY` | `true` | The `remember` and `forget` tools, and the memory block in the prompt |
| `OPENAI_VOICE` | `ripple` | Initial voice: ripple, vesper, stone, meridian, tempo, beacon, cinder |
| `OPENAI_LIVE_MODEL` | `gpt-live-1` | Preselected GPT-Live model |
| `OPENAI_BACKEND_MODEL` | `gpt-5.6-terra` | Preselected Responses backend for reasoning and tools |
| `WEB_SEARCH` | `true` | Hosted web search; browsers may disable it |
| `OPENAI_BASE_URL` | OpenAI | Points the proxy at a gateway or a stub |
| `PORT` | `5173` | |
| `SSL_KEY`, `SSL_CERT` | — | Paths to a real certificate; `npm start` then serves HTTPS |
| `CONNECTORS` | — | Coding agents Vince may hand work to: `codex` |
| `CONNECTOR_CWD` | `process.cwd()` | The workspace agents run in |
| `CONNECTOR_TIMEOUT` | `900` | Seconds before a task is stopped |
| `CONNECTOR_LIMIT` | `3` | How many tasks may run at once |
| `CONNECTOR_FILE` | `connectors.json` | Where the panel saves the setup |
| `CONNECTOR_ANNOUNCE` | `true` | Tell Vince when a task finishes |
| `CODEX_COMMAND` | `codex` | A whole command line, so the CLI can be wrapped |
| `CODEX_MODEL`, `CODEX_ARGS`, `CODEX_CWD` | — | Per agent |
| `CODEX_SANDBOX` | `workspace-write` | Its sandbox policy |

The picker lists GPT-Live models accessible to your API key. Vince defaults to
Ripple. An authorized voice outside the list can be set with `OPENAI_VOICE`.

The third picker is the other end of the call: the Responses model Vince
delegates reasoning, lookups and tool calls to. It lists the text models your
key can reach from GPT-5 on — older families, the speech, image and embedding
models that share the prefix, the dated snapshots and the Codex builds are left
out; a later family is let through by its number, so a GPT-6 appears on its own
— with `OPENAI_BACKEND_MODEL` preselected
and always offered, whether or not the key lists it. Naming anything else is
refused by the proxy and the configured backend is minted instead;
`OPENAI_BACKEND_MODEL` is how you run on something outside that set.

Changing voice, model or backend reconnects with recent history.

Replace `OPENAI_REALTIME_MODEL` in existing `.env` files with
`OPENAI_LIVE_MODEL=gpt-live-1`. This clone uses the Live protocol only.

## On a phone

```sh
npm run dev:lan           # → https://192.168.x.x:5173, printed on start
```

Microphone access needs a secure context. `localhost` is one; a LAN address over
plain HTTP is not — `navigator.mediaDevices` doesn't exist there, so the page
can't even raise the mic prompt. The `:lan` scripts serve HTTPS with a
self-signed certificate, cached in `node_modules/.vite/`.

No browser trusts that certificate, so the phone shows a warning the first time
("Advanced" → proceed on Chrome, "Show details" → "visit this website" on
Safari). Tap through it once per device. To skip it, point `SSL_KEY` and
`SSL_CERT` at a certificate the device already trusts —
[mkcert](https://github.com/FiloSottile/mkcert) issues one for a LAN IP.

## Docker

```sh
docker run --rm -p 5173:5173 -e OPENAI_API_KEY=sk-... h1ddenpr0cess20/vince
```

Images go to Docker Hub on every push to `main` (`latest`) and on `v*` tags
(`1.2.3`, `1.2`), for `linux/amd64` and `linux/arm64`. Configuration is the same
set of variables as `.env` — pass them with `-e` or `--env-file .env`.

The container serves HTTP on `PORT` and expects TLS to be terminated in front of
it; to serve TLS from the container, mount a certificate and set `SSL_KEY` and
`SSL_CERT`. Build it yourself with `docker build -t vince .`. Publishing from a
fork needs a `DOCKERHUB_TOKEN` secret, plus a `DOCKERHUB_USERNAME` variable if
your Docker Hub account isn't `h1ddenpr0cess20`.

## Tools

GPT-Live handles speech while a Responses backend handles reasoning and tools.
The managed backend supports `web_search` and custom `function` tools. Search
is enabled by default; memory and enabled coding-agent functions are retained.
MCP, file search, image generation and code interpreter are not declared because
they are not supported by Live's managed Responses configuration.

The tools panel stores each browser's search preference and reconnects the call
when it changes. `WEB_SEARCH=false` disables search server-wide. Source links
appear below spoken captions — each cited page once, the oldest giving way past
six, and cleared along with the caption they belong to. Backend text is not
presented as speech.

Official contracts: [Live tools](https://developers.openai.com/api/docs/guides/live-delegation),
[session configuration](https://developers.openai.com/api/docs/guides/live-conversations),
and [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live).

## Connectors

`connectors` opens the panel for the coding agent Vince can hand work to: Codex,
run headless, once per task, in a workspace directory. Say what you want built
and it goes out to an agent that reads, writes and runs things for real.

Nothing is on by default. A connector runs a CLI that edits files on the machine
serving the page, so it is opt-in there — `CONNECTORS` names the agents to start
with, and the panel turns them on and off while the server runs. What the panel
writes goes to `connectors.json` and survives a restart.

One thing is deliberately not editable from the browser: the command each agent
is run as. That is the difference between configuring a tool and choosing which
binary this server executes, and the second one does not belong to anything a
page can reach. It comes from `CODEX_COMMAND`, and it takes a whole command
line, so `docker exec -w /work dev codex` wraps the CLI as well as names it.

Sandbox policies come from the CLI, safest first, and the panel warns on the
ones that can act outside the workspace. The agent inherits the server's
environment minus `OPENAI_API_KEY` — the key that dials the call is not the
agent's to spend.

Three tools do the work: `dispatch_task` hands one task to one agent and returns
a number immediately, `check_task` reports where it stands, and `cancel_task`
stops it. Whatever an agent already wrote to disk stays written when a task is
stopped or times out.

### How a tool call gets to the server

Vince's call runs browser-to-OpenAI over WebRTC, so a tool call the model makes
arrives in the page and nowhere else. The page hands the connector ones back to
the server at `POST /api/connectors/run`, which is the only reason this server
can dispatch at all. Anything that changes something — that route, and saving
the setup — is refused unless it came from this page, since there are no
accounts here and these routes spawn processes that edit files.

The panel polls `/api/tasks` while something is running, for the same reason:
there is no socket back from the server to push a status down. A task that
settles is told to the model as it lands, as a line marked `[workspace]` so it
is not mistaken for the person talking. `CONNECTOR_ANNOUNCE=false` keeps the
board and drops the telling.

Which agents are on is settled when a session is minted, so switching one on
mid-call redials — the conversation is kept, and the new tool list goes out with
it.

## The log and the memory

`log` opens past conversations, newest first. `new` closes the record and, if a
call is up, dials again — the model's memory of what was said is the call
itself, so a new call is the only thing that clears it. `clear` asks once, then
removes the log.

`memory` opens the short list of details Vince carries between calls. Ask him to
remember something and he calls `remember`; ask him to forget it and he calls
`forget`, which drops every stored line matching the keyword. You can also add a
line by hand, drop one, switch the whole thing off, or clear it. `MEMORY=false`
removes the tools and the prompt block for everyone the server serves.

Editing the list by hand takes effect on the next call rather than the current
one — the instructions are set when the Live session is created, and the page has no
copy of the persona to re-send with. A `remember` the model makes mid-call needs
no such round trip: it already knows what it just stored, because the tool
result said so.

Both live in `localStorage`, in the browser that made the call — see the
[design notes](design.md#storage) for the caps and what crosses the wire.
