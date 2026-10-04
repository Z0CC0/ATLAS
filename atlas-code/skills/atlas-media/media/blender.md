# Blender — checking a character and its motion by numbers

A screenshot of a rig shows a pose. It does not show which way the character faces, whether
the feet slide, or whether the scale is off by a hundred. Those are read from the scene's
data with a script, and reported as numbers.

Nothing in the file is changed. The script reads; fixes are proposed and applied only when
asked, on a copy.

## How

Blender runs without its window and executes a Python script:

```bash
blender -b scene.blend --python inspect.py -- --out report.json
```

The script uses `bpy` to read objects, armatures, bones and animation, steps through the
frame range with `scene.frame_set`, takes bone positions in world space (the armature's
world matrix times the pose bone's matrix), and writes JSON. Only the summary comes back
into the conversation. `blender --version` first: the Python API differs between
versions, and a file saved by a newer Blender may not open in an older one.

## What to read out

**Inventory.** Objects by type; the armature and how many bones; meshes and what they are
parented or skinned to; actions and their frame ranges; the scene's frame rate and units.
**Scale and transforms.** The character's height in metres from its bounding box.
Unapplied scale or rotation on the armature or meshes: a common cause of everything that
follows.
**Orientation.** Which world axis is up and which the character faces, from bone
positions: hips to head for up; the direction the toes point from the ankles, or the
cross product of the hip line and the spine, for forward. Compared with what the target
expects (an engine, another rig).
**Rest pose.** T-pose or A-pose, by the angle of the upper arms; whether it matches the
motion's source rig.
**Ground contact.** The lowest point of each foot per frame against the ground height:
floating (always above), sinking (below), or correct.
**Foot sliding.** For frames where a foot is on the ground (its height near the floor and
barely changing), how far it moves horizontally. A planted foot should not travel.
**Root motion.** The path of the hips or root over the action: distance, direction,
whether a loop returns to its start, whether the character moves the way it faces.
**Breaks.** Sudden jumps in a bone's position or rotation between consecutive frames;
limbs stretching beyond their rest length; flipped joints.

## Thresholds

Stated in the report, relative to the character's height, since scenes differ in scale. As
a starting point: sliding beyond about one percent of height while planted is visible;
penetration or floating beyond the same is visible; a facing direction more than a few
degrees off the direction of travel reads as skating sideways. Adjust to the project and
say what was used.

## Report

```
scene     walk.blend  Blender 4.x · 24 fps · metres
character 1 armature (65 bones), 3 meshes, height 1.78 m; armature scale 0.01 unapplied
facing    forward −Y, up +Z; moves along +Y  → walks backwards relative to its facing
feet      left: planted frames 4–15, slides 0.11 m (6% of height)
          right: planted frames 20–31, slides 0.10 m
ground    feet 0.03 m below the floor at contact
loop      root returns to start: no, drifts 1.42 m per cycle (root motion, expected)

LIKELY   retarget applied to a rig facing the other way; scale unapplied
```

The last line is a hypothesis with its evidence, not a certainty. What was not measured
(hands, face, cloth) is listed.
