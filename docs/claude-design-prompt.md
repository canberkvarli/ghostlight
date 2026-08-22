# Ghost Light — prompt for Claude Design

Paste the section below into Claude Design (or any capable AI design tool). It is
self-contained: it carries the concept, the exact design system, and the three
deliverables (app icon, splash, onboarding screens). Everything here matches the
built iOS app so the generated art drops straight in.

---

## PROMPT — copy from here

You are designing for **Ghost Light**, an iOS app that does one job: help a
working actor find a monologue — search 10,863 of them, read them, save them,
prepare them. It is not a scene-partner or line-reader app. The feeling is a
**quiet theatre after hours**: a single bare bulb (a real "ghost light") left
burning on a dark, empty stage. Intimate, warm, cinematic, understated — never
techy, never loud, never corporate SaaS.

Design three things: **(1) the app icon, (2) the launch splash, (3) a 3-screen
onboarding flow.** Deliver iOS-ready art (1024×1024 icon; 1290×2796 screens).

### The one image everything is built on
A bare, glowing **amber bulb** with a soft radial halo, sitting atop a thin
**stand/stem** that fades downward into shadow — alone on a warm near-black
stage. That mark IS the brand. Keep it simple enough to read at 60px.

### Exact palette (use these, do not substitute)
- Warm near-black stage — **#130b08** (NEVER pure/flat black)
- Card / raised surface (dark) — **#1d140f**
- The bulb + all glow — **#f3821d** (amber)
- Brand orange / primary accent — **#cb4b00**
- The stand/stem — **#362b24**
- Text on dark — **#f3eee6**; muted — **#a59d95**
- Warm reading paper (the light world) — **#f8f4f0**, ink **#15110f**

There are two worlds: the **dark stage** (everything) and a **warm paper**
reading canvas (used only when reading a monologue — a deliberate inversion so
long text is easy on the eyes). Onboarding, icon and splash all live in the dark
stage world.

### Type
- **Playfair Display** (semibold) — big display titles and numbers only.
- **Courier Prime** (italic, lowercase) — stage directions like `(lights up.)`;
  this is the "voice of the play."
- **Montserrat** — all UI chrome, labels, buttons.

### Motion & tone (for anything animated)
- The bulb **strikes on** like a filament — a quick stutter up from dark — then
  holds with a slow 7s flicker. Gentle, alive, never a hard pulse.
- No bounce. Entrances are slow eased fades/rises (~700ms), cinematic.
- Buttons are **gentle**: a thin lit-amber outline over a whisper of warm fill
  with amber text — NOT loud solid-orange slabs. Primary actions can be as
  quiet as a word + arrow (e.g. `NEXT →`).
- Grain/vignette on dark surfaces so they never band.

---

### Deliverable 1 — App icon (1024×1024, no transparency, no rounded corners)
The amber bulb centered on the warm near-black stage, its halo glowing, a short
stem fading below it. Bold enough to read small. This is a lone light in the
dark — resist the urge to fill the canvas; the darkness is the point.

### Deliverable 2 — Splash
The same warm near-black (#130b08) field, the bulb mark centered, small. It
should feel like the house lights are down and one light is on — the app then
"comes up" into the stage. Minimal.

### Deliverable 3 — Onboarding, 3 screens (swipeable, skippable)
Dark stage on all three. Each: the bulb near center, a Courier-italic eyebrow, a
Playfair headline, one line of Montserrat body, page dots, and a quiet `NEXT →`
(the last screen says `BEGIN →`). A "SKIP" in the top-right. It sells the promise
— it does NOT explain the UI. Ruthlessly short. Exact copy:

1. eyebrow `(lights up.)` — headline **10,863 monologues.** (the number big and
   amber, "monologues." in white) — body: *Every speech worth knowing, on one stage.*
2. eyebrow `(enter, filtered.)` — headline **Filtered by who you actually are.**
   — body: *Age, gender, tone, length — narrowed to parts you can walk in and book.*
   — show 4 lit amber chips in Courier italic: `(female.)` `(20s.)` `(comedic.)` `(under 2 min.)`
3. eyebrow `(the ghost light waits.)` — headline **Find your next one.** — body:
   *Search is free, forever. Start reading now.*

### Hard rules
- Never flat black; the dark is warm (#130b08).
- The bulb/halo/stem is the only illustration — no other icons or imagery.
- Keep it sparse and confident. Lots of dark space is correct.
- No gradients-into-purple, no neon, no drop-shadowed cards, no stock "app" look.

## PROMPT — copy to here

---

## Notes for Canberk (not part of the prompt)
- Name: keep **Ghost Light** as the brand + design. Put the ASO keyword in the
  App Store *title/subtitle* instead, e.g. title "Ghost Light — Monologues for
  Actors", subtitle "Find, read & rehearse your next monologue." No code change.
- The built app already implements this system (see `src/theme/tokens.ts`,
  `src/components/GhostLight.tsx`, `app/onboarding.tsx`), so anything the design
  tool produces can be matched 1:1 — or its icon/splash PNGs dropped into
  `assets/`.
