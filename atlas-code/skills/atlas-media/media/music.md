# Cutting to music

A piece cut to a track is cut to its measured beat grid, not to the beat the ear thinks it
hears. The grid is measured once, with one tool, and frozen as a file; nothing is
re-measured by ear or with a second tool, because two grids that disagree by a frame make
every cut look late.

## The grid

`librosa` (Python) or `aubio` finds the tempo, the first downbeat's offset and the beat
times; when neither is installed, `ffmpeg`'s `ebur128` loudness over time gives the energy
curve and the phrases, which is enough for a calm track. The file holds: tempo, offset,
the beat times, the bars, the energy per beat on a small scale, the key moments (where the
energy jumps), the rolls (several hits closer than half a beat). The storyboard's times are
then written in beats and bars, and converted; a scene that starts "at 1.73 s" is a scene
that drifts.

One timeline drives picture, music and foley together: sections with their tempo and beat
count, every hit addressed as a section and a beat, and the visual events exported as a
list with their exact time so each sound sits on its frame. Before the final render the
visual hits and the audio onsets are swept against each other: the aim is zero
milliseconds, the tolerance five. (lemomo-ai/lemo-opuscar, MIT.)

## Using it

Cuts land on beats, the important ones on downbeats; a cut between beats is a decision and
says why. Movement inside a shot pulses with the beat as a decaying curve from each beat,
so the picture breathes with the music without jumping; drawings held on twos (twelve
changes a second against twenty-four frames) read as alive, not as stutter. On a calm or
ambient track with no clear beat, the cut follows phrases and energy instead, and the
report says so. The music's rights are the person's business, stated in the plan.
(The frozen grid and the energy thresholds: heygen-com/hyperframes' music skill,
Apache-2.0; the pulse and the twos: JohnHeibel/ClaudeAnimationBase, MIT.)

## Report

```
grid     music/track.beats.json  124 bpm · offset 0.31 s · 96 bars · 4 key moments
cuts     38, 36 on beats, 2 off by decision (the two holds before the reveal)
not      the final 8 bars not used; fade decided by the person
```
