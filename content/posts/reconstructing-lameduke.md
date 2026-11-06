---
title: "Reconstructing LameDuke from the DOS Executable"
date: 2026-11-05
description: "Rebuilding the 1994 Duke Nukem 3D beta in C, recovering its early Build engine, and bringing the game and BUILD editor to modern systems."
---

There is something particularly satisfying about taking an old DOS game apart and getting it running again as native code. With LameDuke, that means going back to the December 30, 1994 Duke Nukem 3D beta and reconstructing the game from `D3D.EXE` itself.

I've been working on a C rebuild of that executable, with SDL2 handling the modern platform layer and CMake building the project for Windows, macOS, and Linux. The aim is to preserve the beta's behavior and read its original data files directly, while making it possible to study, run, and edit on a current machine.

The game now runs attract demos and local single-player gameplay, complete with menus, sound effects, and FM music. There is also a BUILD editor adapted to the beta's map format. It is still a work in progress, but it has reached the point where there is a lot more to show than a disassembler window.

![The reconstructed LameDuke running E1L1, with the pistol and original status bar visible.](/images/lameduke/ingame-e1l1.png)

*E1L1 running in the reconstructed game.*

## Starting with the Executable

The reference for this project is the DOS executable, read in IDA. The game code is reconstructed routine by routine in plain C. The later Duke Nukem 3D source is useful context, but the beta has its own behavior, data structures, tile meanings, and unfinished pieces to recover.

Keeping a trail back to the executable matters. Functions carry comments identifying their original addresses: `enterlevel`, for example, is tied to `0x249B0`. Globals retain names such as `byte_1257A8` or `dword_B56D8` where that is the clearest connection to the disassembly. Some structure fields keep offset-based names until their purpose is understood.

That can look a little strange beside ordinary C, but it makes the next comparison much easier. If a door behaves differently or a demo drifts, there is a specific piece of original code to return to.

The initial playable version used a portal renderer. As the reconstruction progressed, that was replaced by the executable's own drawing routines. The same process covered the CON compiler and interpreter, player input, actors, sector effects, demos, menus, saves, sound, and music. Getting a picture on the screen was an early milestone; recovering the code behind that picture is the ongoing work.

## An Earlier Build Engine

The engine needed the same treatment as the game. The classic room and sprite drawing paths are reconstructed from the Build engine linked into this beta.

Even the map records are different from later Duke3D. LameDuke's version-5 maps use 37-byte sectors, 35-byte walls, and 38-byte sprites. Assuming the later layouts would mean reading the wrong bytes before the renderer even got involved.

The files themselves also reflect this earlier stage of development. The game loads loose maps, `TILES*.ART`, CON scripts, demos, sounds, music, palettes, and tables from its working directory. There is no GRP archive to unpack or conversion step for the normal version-5 maps. Two shipped maps, `L9.MAP` and `M8.MAP`, are older version-4 files; a separate converter handles those.

One especially interesting difference is the floor heightmap support. The beta can use a 64-by-64 tile as a grid of floor heights. Those maps do not have the later slope fields, so treating them as ordinary later Build maps would miss part of what the engine actually does.

## Reconstructing Behavior Includes the Awkward Parts

Old machine code can get away with things that need an explicit decision in portable C. The executable sometimes reads through an index of `-1`, leaves values uninitialized, or stores addresses directly in structures.

The rebuild documents those decisions at the relevant code. Invalid reads are guarded or given the value the executable would have read. Script and actor references use indices, with save code converting between that representation and the original address-based form. A missing sound is skipped instead of trying to play whatever happens to live at address zero.

These choices are part of the reconstruction record. When the port deliberately differs from the executable, the comment needs to explain where and why.

## The Game Speed Problem

Timing turned out to be a good example of why a plausible translation is not enough.

The original single-player loop updates the game once per drawn frame. Some movement scales with elapsed timer ticks, but actors, scripts, weapon counters, and other effects advance per call. A faster CPU therefore changes how quickly parts of the game run, even when very little time has elapsed between frames.

Measurements from an instrumented copy of the DOS executable under DOSBox showed about 15 game loops per second at a 486 DX2-66-style cycle setting, compared with roughly 32.5 at a Pentium-class setting. At maximum cycles, it ran much faster again.

The music timer adds another wrinkle: once FM music starts, a chained interrupt handler produces an effective game clock of about 109.2 ticks per second. Simply multiplying the initial 120 Hz timer by the handler's six-tick increment gives the wrong answer because it misses how often that handler is actually called.

The port uses a fixed 120 Hz wall clock with eight ticks per gameplay step, giving 15 logic updates per second. Rendering can run between those steps, with interpolation smoothing the view. Attract demos retain their own recovered pacing. This is a deliberate portability choice, and doors, enemies, and weapon fire still need visual comparison against the DOS version.

## Bringing BUILD Along

Having the game running also makes it useful to inspect the maps in an editor.

![The adapted BUILD editor showing L1 from above, with walls and sprites on its 2D grid.](/images/lameduke/editor-l1.png)

*L1 in the adapted BUILD editor's 2D view.*

The editor interface comes from Ken Silverman's BUILD editor through my Duke3D tree, adapted to this reconstructed engine. It is a later source import, distinct from the game and classic engine code recovered from `D3D.EXE`.

The important constraint is preserving what these maps contain. Opening and saving an unedited shipped version-5 map produces a byte-identical file. Sprite indices and the loaded start position stay intact. Some original sprites sit outside their assigned sectors, so automatically correcting every sprite on save would change the map without the user editing it.

Tile names come from the beta's `DEFS.CON`, and tag captions follow what this game's code does with them. The editor also exposes the early floor heightmaps in place of the later slope controls.

## Modern Additions and Remaining Work

SDL2 supplies the window, input, audio output, and timing. The project also includes optional Polymost Software and OpenGL renderers imported from my Duke3D tree, plus a Video Options page. Classic remains the default and the reference for comparisons with the original executable.

There are still gaps. Multiplayer is stubbed out, joystick input is unimplemented, and music support currently covers the FM path rather than every card in the original setup. The classic renderer and gameplay are still being checked against DOS, and the optional renderers have their own documented differences.

That is what makes this project interesting to me: each recovered routine gives a more concrete picture of how this early version of Duke worked. The result is playable, but the executable still has the final say when a detail needs investigating.

The code, build instructions, and reconstruction notes are in [raynorpat/lameduke](https://github.com/raynorpat/lameduke). For the details behind the timer measurements and the decisions above, see the [game speed notes](https://github.com/raynorpat/lameduke/blob/master/docs/game-speed.md) and [reconstruction documentation](https://github.com/raynorpat/lameduke/blob/master/docs/reconstruction.md).
