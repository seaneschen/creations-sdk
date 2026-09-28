# Guitar Hole Count for rabbit r1

This static creation is designed for the r1's 240×282 display and uses the
Creations SDK channels exposed by rabbitOS.

## Controls

- Tap a quantity to focus it.
- Press the side button to open the quantity carousel.
- Turn the wheel up or down to change the focused value.
- Press the side button again to save the correction and return.
- Tap `−` to break out one guitar immediately.
- A new morning retains category names and starts every input at zero.

Long-press is deliberately reserved for a later on-device voice experiment.
The documented SDK does not currently expose a reliable transcription result
to creations, so the core utility does not depend on LLM availability.

## Synchronization

The production install QR opens a private tokenized path on the Mac mini's
HTTPS tunnel. Every launch validates that path and sets a scoped HttpOnly API
session, so the creation does not depend on storage that OS3 may clear during a
full reboot. The private path passes through ngrok and can appear in ngrok
request logs; its credential is revocable and grants access only to this guitar
count. Manual six-digit pairing remains available as a recovery path. A cached
snapshot permits offline viewing when storage survives, while mutations are
disabled offline so ChatGPT and the r1 cannot silently diverge.

For browser development, open `http://127.0.0.1:8787/r1/`. Browser localStorage
stands in for the injected creation storage APIs.

The install metadata uses `icon.png` for the r1 launcher card. Because rabbitOS
captures that metadata during installation, an existing install must be replaced
once after changing the icon.
