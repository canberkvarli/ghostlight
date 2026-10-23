# Prompt for Claude Code — Ghost Light navigation v2

Paste everything below the line into Claude Code from the repo root. Put this folder at `docs/design/navigation-v2/` first so the paths resolve.

---

Implement the navigation redesign in `docs/design/navigation-v2/`. The screens are in `screens/*.png` (390×844 at @3x), and `reference.dc.html` is the source mock. Open it in a browser and read the inline styles for exact sizes. This is a **UX and navigation change, not a restyle**: keep the current light theme, fonts, colours, card style (2px ink border, yellow offset shadow), Courier stage directions, and the existing Monologue reader and Your book screens exactly as they are.

## Before you write code

1. Map the current navigation: every route in `app/`, how you reach it, and how you leave it. Show me the map and the plan, then wait for my go-ahead.
2. Find the real font families and colour tokens in the theme and use those. The mock substitutes Instrument Serif for the display serif. Don't add new fonts.

## 1. Tab bar (the core change)

- Replace the "everything is pushed from Search" stack with an Expo Router `(tabs)` group with four tabs: **Search** (`index`), **Book** (saved), **Board** (auditions), **Scene** (scene partner).
- Custom tab bar, matching `1a-home.png`: floating pill, 16pt side inset, 26pt above the home indicator, 66pt tall, 2px ink border, card-colour fill, 28pt radius. The active tab gets an ink-filled 52pt pill with a yellow icon and label; inactive tabs are muted. Labels are 10pt, semibold.
- Each tab keeps its own stack. Monologue read, audition detail and scene setup push inside their tab, and their back buttons name the tab they came from, never "Search".
- Hide the tab bar during a rehearsal (`1f`) and in the reader.
- Remove every "‹ Search" back button from tab roots.
- **Account**: a 34pt ink circle with the user's initial in yellow (display serif), top-right of every tab root. It opens the existing account screen. Settings stay inside Account.
- **Collections**: a second view inside the Book tab, not a fifth tab.

## 2. Home / Search (`1a`)

- Header: the 3a mark (`ghostlight-mark-3a.svg`) at about 22pt tall with a soft amber glow, then "GHOST LIGHT" (11pt, tracked), with the account initial on the right.
- Keep the headline, the Plays / Film & TV switch, the search field and the chips as they are.
- Remove "(the board.)", the Auditions card, the "Run a scene" card and the "where you left" card. Replace them with **one "(up next.)" card** of up to two rows:
  - Row 1: the next audition (date block, project and role, type, time, "in N days"). Tapping opens it in the Board tab.
  - Row 2: the last unfinished scene, with a progress bar and **Resume**. Tapping goes straight into the rehearsal.
  - Show only the rows that have data, and hide the card entirely when both are empty.

## 3. Board — auditions (`1b`, `1c`)

- Title "The board." with a summary line, e.g. "(3 coming. 1 callback.)".
- Segments: **Coming up · Heard back · All**.
- The next audition is a hero card: date and time, a countdown pill, project, role, type and casting office, the attached monologue or sides with their prep state, and the text actions "Rehearse →" and "Directions".
- Below it, rows grouped by week. Each row shows what's missing, e.g. a dashed "pick a piece" chip when no material is attached.
- An ink + button with a yellow offset shadow, bottom-right above the tab bar, opens the existing "Next up" add sheet.
- **Outcome tracking (new, `1c`)**: the evening after an audition, schedule a local notification that opens a bottom sheet with four options: **Callback, Booked, Waiting, Passed**. Add an optional note field. Choosing Callback changes the primary button to "Set the callback", which opens the add sheet pre-filled with the same project and role. Store the outcome and note on the audition. The "Heard back" segment lists auditions by outcome.
- Fix the add sheet: the primary button should be ink with a yellow arrow circle once Project and a date are set. The disabled grey state is only for when they're empty.

## 4. Scene partner (`1d`, `1e`, `1f`)

- **Hub (`1d`)**: the first thing on the screen is an ink "Pick up where you left" card (title, "(you're Mark. Aoede reads Esther.)", progress bar with "line X of Y", "Start over" and a yellow **Resume**). Then "YOUR SIDES" as rows. Sides linked to an audition show "(for Thu's callback.)" in rust. "Add sides" is the last row (dashed tile, "PDF, photo, or paste the text"), not a standalone button. Remove the separate + in the header.
- **Cast (`1e`)**: turn the "who are you?" screen into a bottom sheet. Each role is a selectable card; the selected one gets the yellow offset shadow and an ink check, and the other shows its AI voice. **Preselect the role the user last played**, so Begin is never disabled on open. The button reads "Begin as {Role}". Add option chips: Pace, Hide my lines, Cue on silence (wire up only the ones the engine already supports; leave the rest out).
- **Rehearsal (`1f`)**:
  - Header: ✕, the episode title, a thin progress bar under it, and a "9/24" counter.
  - The script starts at the top. Remove the empty space above the first line.
  - The current line is the user's line in a card with a "YOUR LINE" pill, at 21pt. Lines already said fade (about 35–50% opacity); upcoming lines are muted. Auto-scroll keeps the current line in the upper third.
  - Show "(listening.)" with a rust dot while the mic is waiting.
  - Controls: "say it again" (replay the current line), a 76pt ink pause/play with a yellow icon, and "Line ›" to skip ahead.

## Motion

Keep the existing motion language: slow eased fades and rises (~250–400ms for UI), no bounce. Tab switches cross-fade content without sliding. Sheets use the standard iOS detent spring.

## Done when

- No screen outside its own stack shows a "‹ Search" back button.
- From a cold start, Resume on Home or on Scene takes one tap.
- Logging an audition outcome takes two taps from the notification.
- Typecheck and lint pass, and you've listed every file changed.
