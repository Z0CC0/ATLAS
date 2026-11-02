# Installer — a Windows setup program for a Python desktop app

Two stages: compile the app into a folder that runs without Python installed, then wrap
that folder in a setup program. The route here is Nuitka for the first and Inno Setup for
the second; a project already on PyInstaller or another packer keeps it, and only the
second half applies.

Flags change between Nuitka releases: `python -m nuitka --version`, then its help or
documentation for the exact spelling of anything below.

## Asked before building, never filled in

The application's display name, version, publisher, the executable's name, the icon file,
the website if any, and whether it installs for one user or for the machine. These end up
in the Windows "installed apps" list and in the uninstaller: a guessed publisher is
permanent on every machine it reaches.

## Compile

A folder, not a single file. The one-file form unpacks itself to a temporary directory at
every launch: slower to start, and more often flagged by antivirus. The setup program is
what makes it one download.

In a clean virtual environment holding only what the app needs, since anything installed
there can be pulled in.
Standalone mode; the console window off for a graphical app; the icon and the version
resource set (product name, company, file version) so the executable identifies itself.
The plugin for the GUI toolkit in use.
Leave out what is never imported at run time: test frameworks, packaging tools, unused
toolkit modules (a web engine, 3D, charts). Each exclusion is tried: the app is started
and its main screens opened.
Data files the app reads (icons, translations, templates) declared, not assumed.

Run the result from its folder on this machine first; then on a clean Windows with no
Python and no development tools, which is the only test that counts.

## Slim, with care

Measure the folder first: the largest files, by size. A few libraries are usually most of
it.
Safe to remove: caches, tests and documentation shipped inside packages, debug symbols,
translations for languages not offered.
Not safe without trying: package metadata folders (some libraries read their own version
from them), plugin folders of the GUI toolkit (the platform plugin is needed to start),
any DLL whose user is not known.
Lighter variants where they exist: the headless build of an imaging library when no window
of its own is shown.
One removal at a time, the app started after each. Report sizes before and after, as
measured.

## Wrap — Inno Setup

A script (`.iss`) in the repository, compiled with `iscc`.

- `AppId`: a GUID generated once and never changed. It is what lets a new version upgrade
  the old one instead of installing beside it.
- Name, version, publisher and URL from the answers above; the same version as in the
  executable's resource.
- Solid LZMA2 compression at a high setting.
- Install location and privileges by the choice made: per user without elevation, or per
  machine with it. 64-bit mode when the build is 64-bit.
- A Start menu shortcut; a desktop shortcut only as an unchecked option.
- The Visual C++ runtime the build needs, in the matching architecture, installed silently
  when missing; the usual cause of "works here, does not open there".
- Uninstall removes what the app created in its own folder (logs, caches). The user's
  documents and settings are kept unless they agree to remove them.
- The app is closed before files are replaced on upgrade.

## Before it is given to anyone

Install, start, use, upgrade over the previous version, uninstall, on a clean machine or a
virtual one. Check what is left behind after uninstalling.
An unsigned installer shows a warning from Windows on download and on launch: say so. Code
signing needs a certificate the publisher owns; it is their step, and the private key is
never placed in the repository or in a script.
Uploading the installer anywhere waits for a yes, like every other step in this skill.

```
built    dist/Invoicer-1.4.0-setup.exe  41.2 MB  (folder 118 MB → 96 MB after slimming)
tested   clean Windows 11 VM: install, start, upgrade from 1.3.2, uninstall; nothing left behind
not      unsigned; not tested on Windows 10
```
