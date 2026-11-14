# Oddboro phone tools

A Claude Code plugin for testing the Oddboro phone desk. It lives outside
the Oddboro repo, so it never ends up in a pull request.

## Install

You need Claude Code, Node, an Oddboro checkout with the phone desk, and
Tailscale on your computer and your phone, signed in to the same account.

1. In Claude Code, run `/plugin marketplace add Mdellit110/oddboro-phone-tools`.
2. Run `/plugin install oddboro-phone@oddboro-phone-tools`.
3. Start a new session in your Oddboro checkout.

No Claude Code? Clone this repo and run the script by hand (below).

## Use it

Ask Claude in any Oddboro session:

- **"Get it on my phone"** or `/oddboro-phone:ready`. Runs everything below,
  in order, and ends with the link for your phone.
- `/oddboro-phone:look`. Claude opens /desk at phone size in the app's
  browser and screenshots every tab and a call.
- `/oddboro-phone:phone`. Checks Tailscale and gives you the link, a QR code
  and what to tap. It asks before it changes `tailscale serve`.

## The script, by hand

From inside your Oddboro checkout, with this repo cloned to `~/oddboro-phone-tools`:

```bash
node ~/oddboro-phone-tools/oddboro-phone/scripts/phone.mjs start
```

| Command     | What it does                                                 | Time  |
| ----------- | ------------------------------------------------------------ | ----- |
| `tests`     | only the phone's test files                                  | 2 s   |
| `start`     | a test office on 4510, its door on 4512                      | 30 s  |
| `seed`      | 3 sample Odds, chats, 2 goals and an ask (once)              | 5 s   |
| `door`      | 10 requests shaped like the phone's, each must say OK        | 2 s   |
| `tailscale` | the link, QR code and checklist; `--apply`, `--off`          | 1 s   |
| `status`    | test offices running                                         |       |
| `stop`      | stops the office and its database                            |       |

Add `--port 4520` to run a second test office beside the first.

## Good to know

- A test office keeps its own home in `~/.oddboro-phone-test`. Your real
  office in `~/.oddboro` is never touched.
- On the phone, a test office is at `https://<your computer>:8443/desk`.
  Your main address on 443 stays as it is.
- If your main address on 443 points at port 4500, the office refuses the
  phone. For your real office it must point at the door, 4502.
- Tried end to end on Windows with an iPhone. A Mac and Linux should work
  but have not been tried yet.
- On Windows, the office's full test suite fails on about 67 files. Its test
  harness makes symlinks, and Windows allows that only with Developer Mode
  on (Settings, System, For developers). The phone tests do not need it.
- In a worktree, `packages/` comes from the main checkout, so a change
  there in the worktree is not in the test office. `start` says so.
