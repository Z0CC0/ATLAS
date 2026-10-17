# Motion — when things move, and how

Motion explains: where something came from, what changed, what the press did. Motion that
explains nothing is decoration, and decoration that delays the user is a cost.

## Whether to animate at all

Yes: a state change the eye would otherwise miss; something entering or leaving; feedback
to a press; continuity when a thing moves or grows; progress.
No: anything the user does a hundred times a day and wants instant (typing, keyboard
navigation, opening a menu in a tool); content the user is waiting to read; large areas of
the screen at once.

## Numbers to start from

The project's motion tokens when it has them. Otherwise define a few and use only those:

| what | duration | easing |
|---|---|---|
| press, hover, toggle, small colour change | 100–150 ms | ease-out |
| popover, tooltip, dropdown, small element entering | 150–200 ms | ease-out |
| dialog, drawer, panel, page section | 200–300 ms | ease-out in, ease-in out |
| leaving | about two thirds of entering | ease-in |

Larger things and longer distances take a little longer; nothing in an interface needs
more than about 400 ms, except one deliberately authored entrance of a focal element
(500 to 800 ms), once per screen. Easing by job: entering or leaving, ease-out; moving from
one place to another, ease-in-out; a colour or opacity change on hover, ease; constant
travel (a spinner, a progress bar), linear. One curve per job, held as a token. (The bands
and the easing-by-job table are shared by pbakaus/impeccable, Apache-2.0, and
Leonxlnx/taste-skill, MIT.)
Springs for what follows a finger or can be interrupted (drag, sheets, toggles): they carry
velocity and reverse naturally. Low bounce for interfaces; visible bounce only for play.

## What to move

`transform` and `opacity`: the compositor handles them without layout. Animating `width`,
`height`, `top`, `left`, `margin` lays the page out on every frame; use a transform, or
the layout animation of the project's library, or `grid-template-rows` from `0fr` to `1fr`
for a height that opens.
Small distances: 4 to 12 pixels of travel with a fade says "entered" as well as 100 does.
Scale from about 0.95, never from 0.
`will-change` only on what is about to animate, removed after.

## Rules that keep it honest

Interruptible: a transition that is reversed midway turns round from where it is. State
changes are transitions or springs, not keyframes that must finish.
Exit is designed: an element removed from the tree cannot animate unless the framework is
told to keep it (`AnimatePresence`, transition groups, the View Transitions API). The exit
is shorter and quieter than the entrance.
Stagger: 20 to 40 ms between items, capped so the last of a long list does not wait; only
on first appearance, not on every update.
One thing moves at a time for attention. Two simultaneous movements share duration and
easing. Many children driven from one changing variable on their parent repaint them all
at once: each child animates its own property. The ladder of means: a CSS transition, then
the Web Animations API when script must control it, then View Transitions for a change of
view; a library only above that.
Nothing blocks input while it moves. Layout does not jump when it ends.
Server rendering: the first paint is the final state or an intentional initial one, the
same on server and client; no flash from hidden to shown on hydration.

## Reduced motion

`prefers-reduced-motion: reduce` is honoured everywhere, in CSS and in script. Movement,
scaling and parallax go; a short opacity change may stay, because the state change still
has to be seen. Auto-playing motion stops. Tested by switching the setting on, not assumed.

## With a library

Use the one the project has. Read its current documentation for the API before writing:
these libraries rename things between major versions. Tokens and presets in one module,
imported, not retyped per component.

## Checking

Watched at normal speed and at a slowed rate in the browser's animation tools. On a
throttled CPU when the animation carries weight. Frame drops reported as seen, not guessed.
