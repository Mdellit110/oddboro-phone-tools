---
name: phone
description: Get the Oddboro phone desk onto the owner's real phone over Tailscale. Checks Tailscale and tailscale serve, points a test address at the phone door with the owner's yes, prints the desk's link, a QR code and a short tap-through list. Use when the owner wants to try the desk on their phone, asks for the link or QR code, or the phone shows "This office answers only its own computer" or "This door opens only to the owner's own tailnet".
---

# Phone: on the real phone

Script: `node "${CLAUDE_PLUGIN_ROOT}/scripts/phone.mjs" tailscale [--port N]`.

What it does:

- Reads `tailscale status --json`: this computer's name, and any phone on
  the tailnet and whether it is online.
- Reads `tailscale serve status --json` and lists every address and where
  it goes. One that goes to port 4500 is the office itself, which refuses
  the phone. It must go to a door (4502 for the main office).
- With a test office running, the phone uses a test address on https port
  8443, `https://<name>:8443/desk`, which goes to the test door (port+2).
  The main address on 443 is left alone. With no test office, it checks the
  main address against the main door, 4502.
- When set up, it prints the link, writes a QR code page to
  `~/.oddboro-phone-test/phone-link.html`, and prints the tap-through list.

Steps:

1. Run `tailscale`. If it says Tailscale is missing, off, or there is no
   phone, tell the owner that one thing and stop.
2. If it prints "Not set up for this yet" with a command, **ask the owner
   first**, quoting the command. It changes what the tailnet reaches (only
   devices on the owner's tailnet, never the internet). Only on a clear yes,
   run `tailscale --apply`.
3. Give the owner the link as plain text, so they can tap it on the phone.
   Send the QR page with SendUserFile when they are at the computer.
4. Give the tap-through list the script printed.
5. When they are done, offer `tailscale --off`, which turns off only the
   8443 test address.

Never use `tailscale funnel`. It puts the address on the open internet and
the door refuses it anyway.

If the phone shows:

- "This office answers only its own computer": serve points at 4500, not a
  door.
- "This door opens only to the owner's own tailnet": the name is not in the
  office's `ODDBORO_EXTRA_HOSTS`. A test office lists this computer's
  Tailscale name when it starts, so restart it if Tailscale was off then.
- "The office is not answering": the door is open but the office stopped.
