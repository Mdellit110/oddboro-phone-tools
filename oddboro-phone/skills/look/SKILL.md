---
name: look
description: Walk the Oddboro phone desk at phone size (375x812) in the app's built-in browser pane, with screenshots of Home, Goals, a goal, Messages, a chat, Desk and a call, then check the desktop floor still loads. Use when the owner wants to see the phone desk, check it at phone size, or after a change to /desk.
---

# Phone: look

Needs a running test office (`phone.mjs status`; if none, `start` and `seed`
from the `ready` skill). Use the built-in browser tools
(`mcp__Claude_Browser__*`). The office is at `http://127.0.0.1:<port>/desk`,
port 4510 unless the owner said another.

Rules that save time:

- **Click by name, never by position.** A notice can slide in at the top
  and move every button. Use `find` (for example "Call Cindy", "End") and
  click its ref. For the tab bar, run in the page:
  `[...document.querySelectorAll('nav[aria-label="Phone tabs"] button')][i].click()`
  with i = 0 Home, 1 Goals, 2 Messages, 3 Desk.
- **A hash alone does not switch tabs.** `/desk#goals` picks the tab only on
  a full load. Navigating from `/desk` to `/desk#goals` keeps the tab.
- Screenshots at `scale: 0.4` are enough. Read text with `get_page_text`.

Steps:

1. `preview_start` with the desk's url, then `resize_window` 375x812 and
   reload.
2. Home: screenshot. Expect Waiting on you, Happening now, Who's around.
3. Goals: tap the tab, screenshot. Tap a goal card, screenshot its page,
   then Back.
4. Messages: tap the tab, screenshot. Tap an Odd, screenshot its chat,
   then Back.
5. Desk: tap the tab, screenshot. Check the All, Asks, Tasks and Reports
   chips. Never tap Approve or Deny: an approval can send something out.
6. Call: on Home, `find` "Call" and tap one. Screenshot. Tap End.
7. Floor: `resize_window` preset desktop, open `/`, screenshot. A fresh
   test office shows its Welcome panel over the map. That is expected.
8. Always finish with `resize_window` preset desktop.

Report one line per screen: fine, or what looks wrong. Send the owner the
screenshots that show a problem with SendUserFile, not all of them.
