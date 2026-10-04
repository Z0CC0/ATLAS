# Look — measuring the style of reference footage

"Make it look like this clip" is answered with measurements, not adjectives. Two things
can be taken from reference footage with `ffmpeg` and a short Python script, on this
machine: its colour and its rhythm. Both are then applied to the user's own footage.

The references are the user's files. Their look is studied; their frames, music and
graphics are not copied into the new piece.

## Before measuring

Sample frames evenly across each reference (one every second or two is plenty), at a small
size. Leave out what is not the picture: letterbox bars, burned-in captions, an app's
interface around a screen recording, watermarks, title cards. Measured in, they wreck every
number below; crop or mask them first, and say what was masked.

## Colour

Work in a perceptual space (Lab): lightness apart from colour.
Report medians and a robust spread (the median absolute deviation), not means: a few
extreme frames should not move the result.

**Tonal range.** Where the blacks and whites sit (low and high percentiles of lightness),
and the contrast as the spread of lightness across the frame. "Lifted blacks" is a
number: the 1st percentile well above zero.
**Colour by zone.** The average tint in the shadows, the midtones and the highlights
separately. A look is usually a split (cool shadows, warm highlights); a single global
average cancels it out and reports "neutral".
**Saturation.** Its level, and how it changes from shadows to highlights.
**How much of the frame is background.** A look measured on footage that is mostly sky or
wall describes the sky or the wall.

From these, the grade is built as a 3D lookup table (a `.cube` file) that moves a neutral
image towards the measured zones, and applied with `ffmpeg`'s `lut3d` filter. A LUT built
from statistics is an approximation: applied at partial strength first, compared side by
side, and never trusted on skin without looking.

## Rhythm

Cuts found with `ffmpeg`'s scene-change detection. A fixed threshold fails on footage
that is all fast or all slow: set it from the footage's own distribution of change scores,
and check a handful of detected cuts by eye.
What is reported is the distribution of shot lengths, not the average: the median, the
short and long ends, and whether lengths cluster (a steady beat) or alternate (long holds
broken by bursts). With music, whether cuts land on beats.
The new piece is cut to that distribution, not to one number.

## Other things worth noting, by looking at the stills

Framing and distance, camera movement, depth of field, grain and texture, overlays, how
text is set. These are described from a few stills opened here, each claim tied to what
the measurements show; a description that contradicts the numbers is dropped.

## Result

```
references  3 clips, 4:12 total, 126 frames sampled; captions and letterbox masked
tone        blacks lifted (p1 L* 9), whites held (p99 L* 91), contrast low-medium
colour      shadows teal (a* −6, b* −9) · mids near neutral · highlights warm (b* +11)
saturation  low in shadows, moderate in highlights
rhythm      142 shots · median 1.4 s · 10% under 0.5 s · 10% over 4 s · bursts then holds
made        look/ref.cube (33³) · applied at 60% to out/graded-test.mp4, 3 stills compared
not         skin tones not checked; no audio analysis
```

The pack (the LUT, the numbers, the reference stills) is kept in a folder so the same look
can be applied again.
