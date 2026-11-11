---
name: reel_collage
description: Create minimal, editorial vertical reels from local photos and video clips, with occasional centered two-source collages, varied timing, and no nested compositions.
---

# reel_collage

**Status:** Draft specification — portable instructions, not yet a packaged renderer.

Create short-form reels from locally available original photos, video clips, or both. Keep the edit playful and editorial rather than mechanically timed. Prefer simple compositions and hard cuts over visual effects. The agent may use any local tooling that meets this specification (e.g. Python/Pillow for stills, FFmpeg for video and compositing). No chat uploads are required.

## Inputs

- Path to a local folder of photos (JPEG, PNG, HEIC where supported) and/or videos (MP4, MOV and other locally decodable formats).
- Optional output path, preferred duration, ordering, visual references, music, and random seed.
- Never alter or delete source files. Avoid personal paths in scripts and documentation.
- Exclude generated output folders and metadata from source enumeration. Respect source order unless the user requests rearrangement; choose editorial pairings intentionally, with bounded randomness.

## Composition — hard invariant

At any instant, show **one or two original media sources, never three**. If two sources are visible, **at most one may be a video**.

1. **Single:** one original photo or video fills the 9:16 canvas.
2. **Double:** one original photo or video fills the canvas and one *different original photo or video* appears centered on it at approximately 70% of canvas width and height (maintain aspect ratio; crop/fit consistently). Supported double-layer combinations: photo+photo, video background + photo foreground, or photo background + video foreground. **Video+video is not supported**: never pair two moving video clips in the same composition. A video stays moving when paired with a photo.

**Never compose from a precomposed frame, rendered shot, contact sheet, or already-overlaid image/video.** Decode each shot from its one or two original source files and render that composition independently. A frame freshly decoded from an original video is valid; an already-composited output frame is not. Never let an overlay carry into the next shot. This prevents accidental three-layer nesting.

By default, overlays are rectangular, fully opaque and positionally static, without borders, shadows, rounded corners, opacity blending or added animation. Original video motion is preserved.

## Editorial rhythm

- Every source item should appear at least once **alone and unobstructed**, preferably for >=1 second. For video, show a meaningful moving excerpt rather than an arbitrary or static opening frame.
- Use mostly ~1–1.5 second holds; sprinkle occasional short ~0.3–0.7 second cuts, plus longer holds where a photograph needs breathing room.
- Do not enforce a perfect 1-second metronome or put an overlay on every shot. Some full-frame sources should follow other full-frame sources.
- Start with one full-screen source.
- Sometimes reveal a second photo or clip centered over the current source, then cut to that next source full-screen; sometimes jump directly to another full-screen shot.
- A possible progression is A -> A+B -> B -> C -> C+D -> D -> E; this is a **principle, not a required repeating pattern**.
- Use lines, shapes, colors, movement, and subject matter to guide pairings. Randomize sparingly; record the seed so revisions are reproducible.
- Default to hard cuts, no zoom, fades, motion effects, text, filters, logo or music.

## Suggested local workflow

1. Read the source folder, identify supported originals, inspect dimensions and orientation; for video also probe duration, frame rate, rotation, and whether audio is present.
2. Optionally produce a contact sheet of still photos and sampled video frames to make editorial sequencing easier. Sample representative moments rather than exhaustively indexing long recordings.
3. Produce a shot list, each entry with: `type` (single/double), `background_source`, optional `foreground_source`, `duration_seconds`, plus source in-points for each video layer and optional playback-speed settings; save as `shot-list.json`.
4. Validate the plan: every source used as a single, no entry has >2 sources, all double shots reference two distinct originals, **never use two video sources in one shot**, timing remains readable, and first shot is single. Ensure selected video excerpts are long enough for each segment, or deliberately loop/slow them only when requested.
5. Render each shot **directly from its listed original(s)** into a fresh 1080x1920 canvas. Preserve orientation and image character; crop thoughtfully rather than stretch. Use an aspect-preserving fit/crop for the centered 70% overlay. For moving footage, decode the single video source for that shot at the output timeline and hold the paired photo as a still for the required shot duration. Never composite two moving sources.
6. Stitch segments with each shot's own duration using FFmpeg or an equivalent local encoder; never rely on repeated composites. Normalize variable frame rates and orientations for a consistent export.
7. Decode and inspect the final export (including sample frames at cut boundaries). Verify the final duration and make a visual contact sheet of **actual exported frames** if useful.
8. Report the output file path, counts of source photos and videos, runtime, and basic edit structure.

## Default export

| Setting | Value |
| --- | --- |
| Format | Vertical MP4, 9:16 |
| Resolution | 1080 x 1920 |
| Video codec | H.264 |
| Pixel format | 8-bit yuv420p |
| Frame rate | 30 fps |
| Fast start | Enabled (`-movflags +faststart`) |
| Audio | Muted by default (including source video audio); retain, mix, or add music only when requested |

Use common iPhone-compatible encoding settings and test the resulting file rather than claiming guaranteed compatibility with the Photos app. Provide a version with suitable color metadata if an iPhone save error occurs.

## QA checklist

- [ ] First shot is a single original photograph.
- [ ] No more than two original media sources visible in any shot, and at most one video source.
- [ ] No composition ever uses a previously composed image or video as its source.
- [ ] Every source item has an unobstructed full-frame appearance of roughly >=1 second; videos show actual motion.
- [ ] Mix of singles and doubles; timing is varied without making the photos unreadable.
- [ ] No unintended effects, borders, black frames, gaps or overlays persisting between cuts.
- [ ] Video excerpts are trimmed intentionally and play without freezing, unintended speed shifts, or accidental audio. No video+video composites.
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

The shot list must hold paths to **originals only** (plus video in-points and segment timing) and preserve enough edit decisions for another agent to reproduce or revise the reel. Never hardcode personal folders or projects into this skill. This document defines the behavior; implementation scripts, dependencies and automated tests can be added later.
