---
name: ready
description: Take Oddboro phone desk code from "just written" to "ready on the owner's phone" in one go. Runs the phone tests, starts a test office with its phone door, seeds sample Odds, checks the door, looks at /desk at phone size, and checks Tailscale. Use when the owner says test the phone, get it on my phone, is the phone ready, or after changing the phone desk (/desk, apps/office/src/lib/ui/phone, phone-*.ts, the phone door).
---

# Phone: ready

The whole path, in order. Stop at the first step that fails, say what failed in
one plain line, and fix or ask. Keep messages short: the owner often reads on
their phone over Remote Control.

The script is `node "${CLAUDE_PLUGIN_ROOT}/scripts/phone.mjs" <command>`. Run it
from inside the Oddboro checkout or worktree being tested. Each command takes
`--port N` (default 4510). The door is port+2, the database 54329+(port-4500).

1. **Tests.** `tests`. Runs only `src/lib/ui/phone/*.test.ts` and
   `src/lib/server/phone-*.test.ts`, in about 2 seconds. The office's full
   suite fails here on about 67 files only because its harness makes
   symlinks, which Windows refuses without Developer Mode. Say that if asked;
   never change the harness for it.
2. **Office.** `status`. If a test office runs from a different checkout,
   `stop` it first. Then `start` (about 30 seconds, run it in the
   background only if it goes past 2 minutes). It uses its own home in
   `~/.oddboro-phone-test`, never the owner's `~/.oddboro`, and lists
   `phone.test` and this computer's Tailscale name as door names. If it
   prints that packages come from another checkout, tell the owner that
   changes under `packages/` in this worktree are not in the test.
3. **Sample data.** `seed`. Adds 3 Odds, chats, 2 goals and an ask, once.
   It does nothing if the office has Odds already.
4. **Door.** `door`. Ten checks. All must say OK.
5. **Look.** Follow the `look` skill.
6. **Phone.** Follow the `phone` skill.

End with one short summary: what passed, what failed, the phone's link, and
that the test office is still running (`stop` ends it).
