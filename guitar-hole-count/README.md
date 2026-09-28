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

The production install QR carries a revocable device token in the creation URL
fragment. The fragment is part of the address OS3 retains across reboot, but it
is never sent in HTTP requests to GitHub or ngrok. This avoids depending on
creation storage, which some OS3 builds clear during a full reboot. Manual
six-digit pairing remains available as a recovery path and also writes secure
and creation-isolated storage copies. A cached snapshot permits offline
viewing; mutations are disabled while offline so ChatGPT and the r1 cannot
silently diverge.

For browser development, open `http://127.0.0.1:8787/r1/`. Browser localStorage
stands in for the injected creation storage APIs.
