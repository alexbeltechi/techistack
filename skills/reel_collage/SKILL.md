---
name: reel_collage
description: Create minimal, editorial vertical photo reels from a local folder, with occasional centered two-photo collages, varied timing, and no nested compositions.
---

# reel_collage

**Status:** Draft specification — portable instructions, not yet a packaged renderer.

Create short-form photo reels from locally available original images. Keep the edit playful and editorial rather than mechanically timed. Prefer simple compositions and hard cuts over visual effects. The agent may use any local tooling that meets this specification (e.g. Python/Pillow and FFmpeg). No chat uploads are required.

## Inputs

- Path to a local folder of photographs (JPEG, PNG, and HEIC if the environment supports it).
- Optional output path, preferred duration, ordering, visual references, music, and random seed.
- Never alter or delete source files. Avoid personal paths in scripts and documentation.
- Exclude generated output folders and metadata from source enumeration. Respect source order unless the user requests rearrangement; choose editorial pairings intentionally, with bounded randomness.

## Composition — hard invariant

At any instant, show **one or two original photographs, never three**.

1. **Single:** one original image fills the 9:16 canvas.
2. **Double:** one original image fills the canvas and one *different original image* is centered on it at approximately 70% of canvas width and height (maintain aspect ratio; crop/fit consistently).

**Never compose from a precomposed frame, previous video frame, contact sheet, or already-overlaid image.** For every shot, reload its one or two source files, render on a blank canvas, and discard the working composition before the next shot. Never let an overlay carry into the next shot. This is the essential safeguard against accidentally producing three stacked images.

By default, overlays are rectangular, fully opaque and static, without borders, shadows, rounded corners, opacity blending or animation.

## Editorial rhythm

- Every source photo should appear at least once **alone and unobstructed**, preferably for >=1 second.
- Use mostly ~1–1.5 second holds; sprinkle occasional short ~0.3–0.7 second cuts, plus longer holds where a photograph needs breathing room.
- Do not enforce a perfect 1-second metronome or put an overlay on every shot. Some full-frame images should follow other full-frame images.
- Start with one full-screen photograph.
- Sometimes reveal a second photo centered over the current one, then cut to that next photo full-screen; sometimes jump directly to another full-screen shot.
- A possible progression is A -> A+B -> B -> C -> C+D -> D -> E; this is a **principle, not a required repeating pattern**.
- Use lines, shapes, colors, and subject matter to guide pairings. Randomize sparingly; record the seed so revisions are reproducible.
- Default to hard cuts, no zoom, fades, motion effects, text, filters, logo or music.

## Suggested local workflow

1. Read the source folder, identify supported originals, inspect dimensions and orientation.
2. Optionally produce a contact sheet to make editorial sequencing easier.
3. Produce a shot list, each entry with: `type` (single/double), `background_source`, optional `foreground_source`, `duration_seconds`; save as `shot-list.json`.
4. Validate the plan: every source used as a single, no entry has >2 sources, all double shots reference two distinct originals, timing remains readable, and first shot is single.
5. Render each shot **directly from its listed original(s)** into a fresh 1080x1920 canvas. Preserve orientation and image character; crop thoughtfully rather than stretch. Use an aspect-preserving fit/crop for the centered 70% overlay.
6. Stitch frames with each shot's own duration using FFmpeg or an equivalent local encoder; never rely on repeated composites.
7. Decode and inspect the final export (including sample frames at cut boundaries). Verify the final duration and make a visual contact sheet of **actual exported frames** if useful.
8. Report the output file path, number of source photographs, runtime, and basic edit structure.

## Default export

| Setting | Value |
| --- | --- |
| Format | Vertical MP4, 9:16 |
| Resolution | 1080 x 1920 |
| Video codec | H.264 |
| Pixel format | 8-bit yuv420p |
| Frame rate | 30 fps |
| Fast start | Enabled (`-movflags +faststart`) |
| Audio | None unless requested |

Use common iPhone-compatible encoding settings and test the resulting file rather than claiming guaranteed compatibility with the Photos app. Provide a version with suitable color metadata if an iPhone save error occurs.

## QA checklist

- [ ] First shot is a single original photograph.
- [ ] No more than two original photos visible in any shot.
- [ ] No composition ever uses a previously composed image as its source.
- [ ] Every source photo has an unobstructed full-frame appearance of roughly >=1 second.
- [ ] Mix of singles and doubles; timing is varied without making the photos unreadable.
- [ ] No unintended effects, borders, black frames, gaps or overlays persisting between cuts.
- [ ] Original files remain unchanged.
- [ ] Output decodes, uses the correct 9:16 dimensions and has the intended duration.

## Outputs

Write output to a new destination without overwriting an existing result, following techistack's generated-folder conventions. Suggested contents:

```text
reel_collage_YYYY-MM-DD/
  reel.mp4
  shot-list.json
  preview.jpg
```

The shot list must hold paths to **originals only** and preserve enough edit decisions for another agent to reproduce or revise the reel. Never hardcode personal folders or projects into this skill. This document defines the behavior; implementation scripts, dependencies and automated tests can be added later.
