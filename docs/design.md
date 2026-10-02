# Design notes

How Vince is put together. The [README](../README.md) covers running it;
[configuration](configuration.md) covers the knobs.

## How the call is wired

The API key stays on the server. The browser gathers an SDP offer and posts it
with model, voice, memories, startup history and disabled tools to `/api/session`.
The proxy creates `/v1/live/sessions`; the browser applies `transport.sdp` and
waits for `session.started`. Audio flows directly over WebRTC, and transcripts
and delegated Responses events use the `oai-events` data channel.

GPT-Live handles full-duplex speech. Its Responses backend reasons and uses tools.
Typed input uses `response.item.create` followed by `response.create`; workspace
updates use `session.commentary.append`. Escape requests a speech interruption,
without cancelling coding tasks already dispatched.

Model, voice and tool changes reconnect with recent history. Hangup stops capture
and playback, sends `session.close`, and keeps the transport alive until
`session.closed` or a 15-second timeout. Voice usage is cumulative seconds;
backend usage is separate. Recording is not enabled.

The proxy is connect-style middleware rather than a server, so there's only one
implementation of `/api/*`: `vite.config.js` mounts it in development and
`src/server/app.js` mounts it in front of the static handler in production. No
second process, and the key lives in one place either way.

## Storage

History, memory and tool preferences use `vince.history.v1`, `vince.memory.v1`
and `vince.tools.v1` in browser storage. Relevant memory and resumed history are
sent through the proxy to OpenAI when creating a session; the proxy stores no copy.
Startup history is restricted to user and assistant text, at most 40 messages
and 6,000 UTF-8 bytes, and supplied as `session.input`.

Transcript fragments retain their exact text and timestamps. Each speaker has
independent display groups with stable IDs; later fragments update existing
history rows. A 1.5-second timestamp gap starts a new display group. This is a UI
heuristic, not a semantic turn boundary, and never triggers tool execution.

Nested `response.event` envelopes carry backend work. Completed function items
are collected before the terminal response event, executed once, and all outputs
are submitted through `response.item.create` before one `response.create`
continuation. Late results from disconnected calls are discarded. Backend output
is not spoken-caption text; its URL annotations become clickable sources under
the caption, deduplicated, the oldest giving way past six, and cleared with the
caption they belong to.

## States

`idle` · `listening` · `thinking` · `speaking` — each a set of targets for
jitter, lean, attend, sway, cock, swirl, hop, perk, flutter and squash. Vince
eases between them, so transitions read as the same ear changing mood rather
than a cut.

- **idle** — sways on his lobe, half turned toward you, with a twitch, a little
  bounce or a perk every few seconds.
- **listening** — turns square on to the camera, wherever you have orbited it,
  leans in and stands up a little taller. Your voice makes him flutter, like
  something picking it up.
- **thinking** — turns away, cocks to one side, and lets the cock wander round
  in a slow swirl. It's the one pose the other three never take, which is what
  makes the state legible at a glance.
- **speaking** — hops on his lobe, a short step at a time, squashing as he
  lands and on every syllable.

Transcript activity drives listening and speaking poses. Backend work drives
thinking between transcript updates. The display timeout is a visual heuristic,
not proof of audio playback completion.

Three nested groups keep those motions from fighting: the outer one carries the
hop, the swirl and the tremor, the middle one turns him about world up, and the
inner one — pivoted at the bottom of his lobe — owns the lean, the cock, the
sway and the squash.

## The ear, and the paint

The ear is built rather than modelled: a closed outline, a relief pressed into
the front of it (helix, scapha, antihelix and its two crura, the concha, the
canal, tragus, antitragus and a fold-free lobe), and a rolled rim joining that to
a plainer back. It is a left ear. Nothing in it is random, so he is the same ear
on every load, and the tests check the anatomy is where it should be and that
the back never comes through the front.

His skin is painted once at startup onto two canvases — colour and a bump map —
with a few thousand short strokes that run along the folds of the relief rather
than across them. Colour follows depth: dark down the canal, warm in the bowl,
light on the ridges, a flush along the helix and the lobe, the odd viridian or
cobalt note, and a blue contour line round the rim. Each stroke is pressed into
the bump map as a ridge with bristle grooves, which is what reads as impasto
under the lights.

The landscape behind him is painted with the same brush onto a canvas under the
stage: an evening sky with drifting clouds and the odd eddy, two lines of rolling
hills, and patchwork fields whose furrows run to a vanishing point. It is the
kind of thing he painted, not one of the things he did. It paints itself in a
few milliseconds a frame (all at once under `prefers-reduced-motion`), and only
repaints when the window changes shape enough to want a different composition.

## Layout

```
Dockerfile              Build the client, then serve it from src/server
index.html              Markup only — Vite's entry
src/
  client/
    main.js             The wiring, and nothing else
    styles.css          The HUD around Vince
    api.js              The server's endpoints, as functions
    history.js          Past conversations in localStorage, and picking one up
    memory.js           What it remembers between calls, in localStorage
    tools.js            Which of the server's tools this browser switched off
    tasks.js            The work agents are doing, mirrored and polled
    ear/                Geometry and animation. Knows nothing about transports
      index.js            The controller and the per-frame loop
      moods.js            Targets per conversational state
      motion.js           The spring and the chase every channel eases on
      pinna.js            The outline, the relief, the mesh, and the material
      skin.js             Oil on canvas, painted once along the folds
      environment.js      An evening studio env, for the varnish to catch
    paint/              The brush, and the landscape behind him
      brush.js            Seeded randomness, colour, and the loaded stroke
      landscape.js        Sky, hills and fields, a batch of strokes at a time
      backdrop.js         The canvas under the stage, painted in and kept
    session/            The call. Emits transport-agnostic events
      index.js            Lifecycle: mic, session, connect, meter, tear down
      webrtc.js           Peer connection, data channel, SDP handshake
      events.js           Live and nested Responses events → this vocabulary
      tools.js            remember/forget in the page; the rest routed to the server
      metering.js         Two analysers → one 0..1 number per frame
      emitter.js
    ui/
      hud.js              Status chip, transcript, caption
      menu.js             The corner menu, and the list of panels it drops
      history.js          The log panel behind `log` in the menu, and its `continue`
      memory.js           The memory panel behind `memory` in the menu
      tools.js            The tool switches behind `tools` in the menu — web search
      connectors.js       The setup and the work board, behind `connectors` in the menu
      controls.js         Mic (tap mutes, hold hangs up), field, send, pickers
      viewport.js         Keeps the composer above the on-screen keyboard
    vendor/
      gfx/                The 3D engine: <three-d-stage>, WebGPU, else WebGL 2
  server/
    index.js            Entry point
    app.js              The middleware chain
    api.js              /api/models + /api/session, and the connector routes
    openai.js           The two calls it makes
    persona.js          Who Vince is, and the session config
    origin.js           Who is allowed to ask for a change
    config.js           The environment, resolved once
    static.js           Hosting for dist/ — production only
    connectors/         Coding agents, and the tasks handed to them
      index.js            The registry: settings, tools, dispatch
      agents.js           Each CLI as a command line, and how to read it back
      settings.js         What the panel may change, checked and saved
      tasks.js            The child processes, and their status
      tools.js            The three function tools, as the model sees them
docs/                   These notes, configuration, policies, screenshots
test/                   node:test, against a stub OpenAI
.github/workflows/      CI (lint, tests, build smoke test), CodeQL, Docker publish
```

`src/client/vendor/gfx/` is the 3D engine, the same one
[Marc](https://github.com/h1ddenpr0cess20/marc) runs on, written for these
characters rather than pulled in: `<three-d-stage>` (studio lighting, ground
shadow, orbit controls, framing, resize), the scene API the rig is built from —
handed over as `GFX` — and the same shading in WGSL for WebGPU and GLSL for
WebGL 2. WebGPU is
tried first, WebGL 2 takes over where it is missing or its device is lost, and
`?renderer=webgl` pins the fallback. The scene was first written against
three.js r186, and the engine follows its maths closely enough to draw the same
picture; `vendor/gfx/LICENSE` says which parts are ported.
The shaders are plain `.glsl` and `.wgsl` files under `vendor/gfx/shaders/`,
put together per draw by `glsl.js` and `wgsl.js`. The stage clears to
transparent, which is how the landscape shows through behind him; Vince sets no
`background` on it, only a scrim that darkens the bottom where the captions sit.

## The transport seam

`session/index.js` exposes `on`, `start`, `stop`, `send`, `note`, `cancel`,
`context`, `messages`, `connected`, `busy`, `stale`, `state`, `muted`, `model`,
`voice` — and emits:

```
'state'   connecting | listening | thinking | speaking | idle
'caption' the assistant's spoken row so far, whole — it replaces, not appends
'user'    the person's spoken row so far, whole
'source'  a url_citation the backend attached to what it answered
'tool'    a label while a tool works, or null
'memory'  the result of a remember/forget the model just called
'task'    a coding-agent task as it was dispatched, checked or stopped
'level'   0..1 sustained amplitude, per frame
'pulse'   0..1 transient, one per discrete event
'message' a row as it stands, { id, role, content, fragments } — what the log stores
'busy'    whether a backend response is in flight
'usage'   cumulative voice usage; `final` on the last one
'backend' a delegated response that settled, with its own usage
'error'   { message }
```

A spoken row grows: `caption`, `user` and `message` are re-emitted with the
whole row each time a fragment lands in it, identified by a stable `id`. The HUD
replaces what it is showing, and the log rewrites that row rather than adding
one. Those rewrites are held briefly before the log is serialised, so a sentence
costs one write instead of one per word; ending a call settles what is held.

Vince takes audio-shaped input:

```js
vince.setState('speaking')  // idle | listening | thinking | speaking
vince.setLevel(0.62)        // sustained amplitude 0..1, sampled per frame
vince.pulse(0.4)            // transient impulse 0..1, one per discrete event
```

Both land on the same internal energy value. `setLevel` carries the voice — two
`AnalyserNode`s, one on the mic and one on the model's track, read per frame and
smoothed with a fast attack and a slow release. `pulse` is for the beats where a
turn changes hands: it kicks the springs directly as well as the energy, so the
squash punctuates instead of strobing.

Swapping providers means writing a different `createVoiceSession()` with that
surface. `main.js` and the ear don't change.
