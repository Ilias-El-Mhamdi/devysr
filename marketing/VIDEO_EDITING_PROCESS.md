# Process: pre-cut screen recordings → polished demo video (voiceover, subtitles, music)

This documents the pipeline used for the second Lead Bridge demo
(`design/in_progress/videos/new/Lead_Bridge_demo.mp4`), built from raw clips already cut
one-per-script-beat rather than one long recording. It supersedes the first video's
transcribe/silence-detect approach below — see "Why this replaced the v1 process" for what
changed and why. Repeat this version whenever the source is already split into short,
labelled clips (`LM1`, `ST3`, etc.); fall back to the v1 approach only if you're ever handed
one continuous recording again.

## One-time environment setup

```bash
# Full ffmpeg build (the homebrew default `ffmpeg` formula lacks libass/drawtext —
# burned-in subtitles and text cards will silently fail without this)
brew install ffmpeg-full
FF=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
```

ElevenLabs API key/voice ID: stored outside the repo, never committed. Cost: ~$0.05–0.10 per
full script generation with `eleven_multilingual_v2` — cheap enough to regenerate individual
lines freely while iterating.

## Structure: timeline.json + build.py, not hand-written filter files

Everything lives under `edit/`: `timeline.json` declares every script beat (which clip, which
in/out points, relative pacing), and `build.py` runs fixed steps —
`norm → beats → concat → subs → audio → final`. A revision is an edit to the JSON plus a
re-run of one step (`python3 build.py beats ST2` to redo just one beat), not a new set of
ad-hoc filter-string files. The v1 video accumulated `filter_v1.txt` … `filter_v6.txt`,
`subs_v1.ass` … `v6.ass`, etc. — one throwaway file set per revision. Don't repeat that.

## Pipeline steps

1. **Get the client's own cut points before trusting any auto-detection.** Every raw clip
   here ends with the macOS "Stop Screen Recording" toolbar drifting into frame — the mouse
   moves toward it before the bar itself appears. Comparing frames against a fixed toolbar
   region catches the bar once it's rendered, but *misses the mouse-drift lead-in* and can
   also mis-fire on light-themed or high-contrast footage (false "clean" reads happened on
   both a light Excel clip and a dark dashboard clip in this project). If the person who
   recorded the footage can give `clip | start_second | end_second` for each one, use that
   directly as the segment bounds — it's more reliable than any pixel heuristic. Confirm with
   a frame extract at the boundary before rendering:
   ```bash
   ffmpeg -ss <t> -i raw/clip.mov -frames:v 1 -vf "crop=1160:312:940:1400" check.png
   ```

2. **Normalize every raw clip to constant frame rate first.** macOS screen recordings are
   variable frame rate — a frame is only written when the screen changes, so a static
   stretch can contain *zero* frames for seconds at a time. Trimming or speed-ramping
   (`setpts`) into one of those gaps silently loses that duration, because `setpts` anchors
   to the first frame that actually exists, not to wall-clock time. This alone caused beats
   to render up to a second short before the fix. Re-encode to CFR once, up front:
   ```bash
   ffmpeg -i raw/clip.mov -vf "fps=60,scale=W:H:force_original_aspect_ratio=increase,crop=W:H" \
     -c:v libx264 -crf 14 norm/clip.mp4
   ```
   Cut everything downstream from the normalized copies, never the raw `.mov`.

3. **Cut video to the voiceover, not voiceover to the video.** Generate every VO line first
   (one ElevenLabs call per beat, saved as `<BEAT_ID>.mp3`) and measure its real duration.
   Each beat then gets one multiplier solved so its footage segments — trimmed and weighted —
   exactly fill `pad_before + vo_duration + pad_after`. This removes the `map_time()`
   translation layer the v1 process needed (see below): there's no "what does t=21s in the
   raw recording correspond to in the final cut" problem when the cut is built directly
   against the line lengths.
   - Segments are `[in, out, weight]` in source seconds. `weight` is relative pace — `1.0`
     normal, higher blows through faster (a progress bar), lower would slow down. The build
     script solves one multiplier so the weighted segments hit the target exactly.
   - If a beat's footage would need to slow down past a floor (currently 0.6×) to fill the
     line, stop stretching and freeze-hold the last frame for the remainder instead — molasses
     slow-motion reads worse than a hold.
   - A beat can also point at another beat's *frame* instead of its own footage
     (`"freeze_of": "ST8"`) — useful when a long line has nothing new to show and the cleanest
     option is holding what's already on screen (used for the "and this is only the starting
     point" close, continuing straight off the previous beat's settled state).

4. **Title/closing cards: fit, never crop.** Scale to fit inside the frame and pad with the
   card's own background colour, rather than scale-to-fill — a scale-to-fill crop ate the
   brand's left-edge accent bar on the first attempt. Add a short fade in/out at the card's own
   background colour so the cut in/out doesn't hard-pop.

5. **Subtitles**: write a `.ass` file directly (not `.srt` + `force_style`, which is fragile to
   quote/escaping across shells) with `PlayResX/Y` matching the video resolution and an
   explicit font size — otherwise libass falls back to a huge default size. Burn in with
   `ass=subs.ass` via `-filter_script:v` (avoids shell-quoting problems with `-vf`). Reserve a
   fixed-height band at the bottom of the frame (padded, not overlaid) so captions never sit on
   top of dashboard UI.

6. **Audio mix**: background music on `-stream_loop -1`, trimmed to the final duration, low
   volume, fade in ~1.5s, fade out over the last few seconds ending exactly at video end.
   Voiceover lines placed with `adelay` per clip (computed from each beat's actual position in
   the built timeline, not the original recording), `amix`'d together, then mixed again with
   the music bed. Normalize/limit the final mix (`dynaudnorm` + `alimiter`) rather than trusting
   individual clip levels to already match.

7. **Final render, sized to an explicit budget.** If there's a hard delivery ceiling (e.g. an
   email attachment limit), compute the video bitrate backwards from
   `(target_MB * 8000) / duration_seconds - audio_kbps`, and two-pass encode to that `-b:v`
   rather than picking a CRF and hoping. Screen recordings compress well — mostly static
   frames — so 1920-wide/30fps at a size-constrained bitrate still reads sharp; check a still
   of dense text/table content before calling it done.

## Why this replaced the v1 process

The v1 approach (below) was built for one continuous screen recording and had to *discover*
where the beats were: transcribe with whisper, detect silence, watch frames to find real cut
points, then map voiceover timing back onto whatever the edit became. None of that applies
when the source is already split into one short clip per script beat — there's nothing to
transcribe or silence-detect, and building the cut audio-first removes the need to map
anything. If a future recording arrives as one long take again, the v1 steps 1–3 below (or
their equivalents) are still the right way to find beats inside it before switching to the
audio-led build described above.

## v1 process (one continuous recording, kept for reference)

1. **Transcribe** the raw recording with whisper (`--model small`) to understand what's on
   screen and when. Run transcriptions **sequentially**, not in parallel — concurrent runs
   race on downloading the same model checkpoint and corrupt the cache.
2. **Detect dead air**: `ffmpeg -af silencedetect=noise=-30dB:d=1.2 -f null -` on the extracted
   audio track. Gives silence start/end pairs to plan cuts around.
3. **Watch the actual footage** (extract frames at candidate timestamps) before deciding cut
   points — don't trust silence detection alone.
4. **Edit with a variable-speed pass, not hard trims** — never delete-and-jump-cut adjacent
   short clips (visible stutter); instead keep every frame and replay dead stretches faster.
5. **Map voiceover line timing onto the edited timeline**: track every trim/speed operation as
   `(start, end, speed)` segments and write a `map_time()` function (cumulative output duration
   up to input time) to translate raw-footage timestamps into final-cut positions.

## Pitfalls hit (so as not to repeat them)

- Default `ffmpeg` from homebrew has no `subtitles`/`ass`/`drawtext` filter — install
  `ffmpeg-full`.
- `-vf "subtitles=...:force_style=...'"` breaks under shell quoting in almost every variant;
  write the filter to a file and use `-filter_script:v file.txt` instead.
- `force_style`/explicit font size is unscaled relative to the video's actual resolution unless
  you also set `PlayResX`/`PlayResY` in the `.ass`.
- Screen recordings are variable frame rate — normalize to CFR before any `setpts`/trim work,
  or segment durations silently drift.
- Auto-detecting the recording toolbar by pixel diff is not reliable across light/dark themed
  clips — get manual cut points from whoever recorded the footage when it matters.
- Don't crop-to-fill a title/closing card — it can eat a brand's edge accent; scale-to-fit and
  pad with the card's own background instead.
- Don't approximate a brand's logo — ask for the real asset and `overlay` it.
- Parallel whisper invocations on a first run corrupt the shared model checkpoint download
  (only relevant if you're on the v1 path).
