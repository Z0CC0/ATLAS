# Export: formats, sizes, where it will be shown

The render is finished when it plays where it is meant to play, at the size it will be
seen, without a re-encode by the platform that softens it. Export is decided from the
destination, before the final render, and done with `ffmpeg` on this machine.

## By destination

**Web page, embedded** — MP4, H.264 High profile, `yuv420p` (anything else does not play in
every browser), AAC audio 128 kbps or no audio track at all when silent, `-movflags
+faststart` so it starts before it is downloaded. 1920×1080 at 30 fps for screen content;
60 fps only when motion is the content. Target 4 to 8 Mbps for 1080p (`-crf 20` to `23`).
A WebM (VP9) beside it when the page serves modern browsers and size matters.

**YouTube, a video platform** — the same H.264, but higher bitrate (12 to 16 Mbps at
1080p, `-crf 18`): the platform re-encodes, and a soft source becomes a softer result.
Audio at 48 kHz. Loudness around −14 LUFS integrated, measured with `ffmpeg -af
loudnorm=print_format=summary`, peaks under −1 dBTP.

**Vertical and square** (stories, reels, a phone-first page) — 1080×1920 or 1080×1080,
composed for that frame, not cropped from 16:9 after the fact: text safe inside the
central 80%, nothing important in the top or bottom 15% where interfaces overlay.

**A slide, a document, an email** — a GIF only when the player will not run video, and then
under 10 seconds, 800 px wide, 12 to 15 fps, a limited palette (`palettegen` / `paletteuse`);
otherwise an MP4 and a poster image.

**Archive, a source to edit later** — ProRes or DNxHR, or a lossless `-crf 0` H.264, kept
beside the project; the delivery file is derived from it, never the reverse.

## Sound, when there is a voice

The voice is carved, not merely ducked: under speech the music loses six to seven decibels
across the voice's band (250 Hz to 2.5 kHz, deepest around 1.6 kHz), dynamically, with a
fast attack and a release of about a third of a second, so it swells back between
sentences. Before mastering the voice peaks at −3 dBFS or below with no clipped samples;
a piece with no quiet (a few frames of near silence somewhere in each stretch) is tiring.
Two sound effects inside 40 ms are one; one reverb for the whole piece, not one per
scene. Symptom to filter: rumble, high-pass at 80 Hz; boominess, 200 Hz; mud, 250 Hz;
clarity, a touch at 3 kHz; harshness, 3.2 kHz. Master for a film at −16 LUFS integrated
and −3.5 dBTP, for a platform at its own target (above). (The carve and the thresholds:
hyperframes' audio skill, Apache-2.0, and onetake.)

The mix in numbers: the voice compressed first, then the balance set by RMS with the
voice about 10 dB above the music; the band from 20 to 120 Hz about 3 dB under the rest;
no pad notes below MIDI 48; a bass line with its second and third harmonics so it speaks
on small speakers. Master in two passes (`loudnorm=I=-14:TP=-1.2:LRA=11` with
`linear=true` for a platform; a film at its own target), video `-crf 19 -preset slow`,
audio AAC 256k, `+faststart`; then the file is measured again (`ebur128=peak=true`) and a
result off by more than 1 LU or a peak above −1 dB fails the export and deletes the file.
Film grain is added by the encoder at the end (`noise=c0s=N:allf=t`), never drawn in the
frame: grain in the picture makes every frame incompressible and slow; footage that
already has grain is encoded with `-tune grain` and a higher CRF; light backgrounds get
less, pixel and vector styles none. The loudness target is stated in the brief, so the
mix, the master and the check agree on one number. (lemomo-ai/lemo-opuscar, MIT.)

A video that will be scrubbed or cut later is re-encoded with a keyframe every second
(`-g 30 -keyint_min 30` at 30 fps), or seeking lands on the wrong frame.

## What makes a render slow

A `backdrop-filter` or a `filter: blur()` layer on every frame, dozens of animated
shadows, images far larger than the frame (3840 wide is enough for 1080p), an element that
has exited and is still painted: hide it. One such change can triple the render time of
a piece. (hyperframes' performance guide.)

## Stills from the piece

A poster frame chosen by hand (the clearest frame, not the first) at the video's
resolution, PNG for screens with text, JPEG at quality 85 to 90 for photographs; 1280×720
for a thumbnail with text large enough to read at 300 px wide. Diagrams exported as SVG when
the tool produces one, PNG at 2x otherwise.

## Checks before saying it is done

The file plays from the start in a browser and in the system player; the first frame is
not black; the audio is not out of sync at the end (drift shows last); the size is what the
destination accepts; the duration is the planned one to the second; captions, when
delivered separately, line up at three points (start, middle, end). `ffprobe` prints the
codec, resolution, frame rate and bitrate, and those four are written in the delivery note.

## Common commands

```
ffmpeg -i in.mov -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow -c:a aac -b:a 128k -movflags +faststart out.mp4
ffmpeg -i in.mp4 -vf "scale=1080:-2" -c:v libx264 -crf 22 -c:a copy out-1080.mp4
ffmpeg -i in.mp4 -ss 00:00:12 -frames:v 1 poster.png
ffmpeg -i in.mp4 -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" out.gif
ffmpeg -i in.mp4 -af loudnorm=I=-14:TP=-1:LRA=11 -c:v copy out-loud.mp4
```

Each is run once on a short clip first; a render of the whole piece is the last step.
