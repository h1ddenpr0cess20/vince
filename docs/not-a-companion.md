# Not a Companion — Please Read

Vince is a toy and a technical demo: an ear rendered in three dimensions, wired
to a realtime voice model, moving in time with whoever is talking. It is
explicitly **not** meant to be a companion, a friend, a therapist, or a partner.

## Why this is written down — twice over, for this one

- **It is a bit, not a being.** The persona is a system prompt in
  `src/server/persona.js` — an ear with a painter's eye and a soft spot for
  listening. There is nothing behind it that knows you or remembers you beyond
  a short list of details you asked it to keep.
- **He is written to listen, which is exactly the risk.** Vince notices how you
  sound, reflects it back, and asks a good question. That is the shape of being
  heard, and it is the shape most likely to be mistaken for the real thing. It
  is a prompt and a turn-detection threshold. It does not care how you are; it
  has no way to.
- **Voice makes the illusion stronger.** Something that turns to face you and
  answers in real time pulls harder on the parasocial reflex than a chat window
  does. That pull is a rendering trick, not a relationship.
- **Direction of the project.** Effort goes into the geometry, the paint, the
  audio path, and the transport seam. It will not go into simulated intimacy.

## If that was the plan

Consider this the polite version: please don't. If you catch yourself keeping a
call open for company, telling it things you have not told a person, or reaching
for him instead of someone who can actually call back, that is the signal to
stop. Close the tab, go outside, ring someone. Nothing here is a substitute for
that, and pretending otherwise is worse than the loneliness it is standing in
for.

The persona is told to say so too: if you sound like you are really struggling,
he is meant to point you to a person rather than keep you talking. Don't wait
for him to. If you are struggling, talk to a person — a friend, a doctor, a
local helpline. Not an ear.

## What it is for

- Watching audio drive a mesh, which is the actual point
- Procedural geometry and procedural paint, built in the browser at load
- Poking at realtime voice APIs, turn detection, and barge-in
- A conversational front end for search, coding agents, and whatever else gets
  wired in
- Reading a small, complete implementation of the whole path, mic to render

## What it is not for

- Companionship, romance, or simulated intimacy
- Emotional reliance, or anything standing in for therapy
- Treating the model as a person, or the persona as a mind

See also: [AI Output Disclaimer](ai-output-disclaimer.md).
