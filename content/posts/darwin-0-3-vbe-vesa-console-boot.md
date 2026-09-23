---
title: "Bringing OPENSTEP 4.2's VESA Support Back to Rhapsody, Byte by Byte"
date: 2026-09-23
draft: false
tags: ["rhapsodios", "rhapsody", "openstep", "darwin", "reverse-engineering", "vesa", "i386", "bootloader"]
summary: "OPENSTEP 4.2's last user patch taught the i386 booter, kernel and a display driver to speak VESA. Rhapsody never got it. This is how I reconstructed all three layers from Apple's binaries and got a frame-buffer console booting on RhapsodiOS."
---

{{< figure src="images/posts/darwin-0-3-vbe-vesa-console-boot/vbe-console.png" alt="The RhapsodiOS kernel console drawn in a 480 by 360 window on a 640 by 480 VESA frame buffer, stopped at the network prompt" caption="The i386 boot console on a VESA frame buffer: mode 257, 640×480 at 8 bits, under QEMU. Every layer that put it there was rebuilt from OPENSTEP 4.2 binaries." >}}

[RhapsodiOS](https://github.com/RhapsodiOS/RhapsodiOS) is an open-source
reimplementation of Apple's Rhapsody, the system that became Mac OS X Server
1.0. It is forked from Darwin 0.3, the source Apple released in the summer of
1999. It targets both PowerPC and Intel.

On Intel, Rhapsody's console has always been plain VGA. The booter paints a
16-colour panel, the kernel prints into VGA text mode, and a graphical desktop
needs a card-specific driver.

That is odd when you look at OPENSTEP 4.2, Rhapsody's predecessor. In August
1999, NeXT (by then Apple) shipped **OPENSTEP 4.2 User Patch 4** for Intel. Its
`post_install` script calls it the "VBE enabled booter" patch. It taught three
layers of the system to use VESA BIOS Extensions 2.0: the booter, the kernel
and a new display driver, `VBE20DisplayDriver`. Rhapsody had already forked by
then, and it never got any of it.

This post is about carrying that patch across to Rhapsody by reverse engineering,
and about the handful of surprises on the way.

## What the patch contained

The patch is a NeXT `.pkg` that wraps a `compress`-ed tarball. That turned out
to be the first puzzle. Neither GNU tar nor Python's `tarfile` could read it.
The inner tar uses a **225-byte name field** instead of the standard 100, so
every other header field sits 125 bytes later than a reader expects. And the
`.tar.Z` is `compress(1)` LZW, which Python's `gzip` module will not open,
although `gzip -dc` on the command line will. A small custom extractor handled
both.

Inside were three reference binaries, none of which exist in Rhapsody:

- `usr/standalone/i386/boot`, a 44,848-byte booter that announces itself as
  `OPENSTEP boot v40.13.1.2`;
- a fat `mach_kernel` (m68k, i386 and SPARC), whose i386 slice exports two new
  functions, `_FBAllocateVBEConsole` and `_VBEModeInfo2IODisplayInfo`;
- `VBE20DisplayDriver.config`, holding the driver's kernel half (a
  2,324-byte `__text`) and a Configure.app inspector.

## The rules I set myself

The goal was not "VESA support". It was *this* VESA support: 4.2's, as close
to its bytes as our compiler allows. Every function followed the same loop:

1. Disassemble the reference function and measure its extent.
2. Write C.
3. Build it on a Rhapsody guest with the project's own build tool.
4. Compare the result with the reference, masking only the bytes that *must*
   differ, such as addresses of strings, globals and call targets.

Each function ends in one of three outcomes: **byte parity**, **structural
parity** (with every unmatched byte counted and explained), or a
**forced divergence** (labelled in the source and in a divergences record).

Two more rules turned out to matter more than I expected.

- **Reproduce reference defects, don't fix them silently.** When Apple's code
  was wrong, the reconstruction stayed wrong on purpose, with a comment on the
  line saying so. Fixing a defect is a decision, and it gets made in the open.
- **Mark every claim as `[measured]` or `[inference]`, on the line that makes
  it.** Across the project, the most damaging mistakes were inferences that
  hardened into "facts" as they were copied from one document to the next. One
  of them was only caught at the very end, and I come back to it below.

## How the three layers talk

The layers never call each other. They meet at fixed addresses inside
`KERNBOOTSTRUCT`, the block the booter leaves at physical `0x11000` for the
kernel:

| Address | What lives there | Written by |
| --- | --- | --- |
| `0x12854` | kernel virtual address of the mapped frame buffer | the kernel |
| `0x12858` | a 24-byte record for the VBE mode the booter set | the booter |
| `0x12870` | an array of those records, one per usable mode | the booter |

The driver and the kernel both reach these as bare integer constants, with no
symbol and no relocation, so the reconstruction has to do the same.

In Rhapsody's version of the struct, all three addresses fall inside a
7,500-byte `_reserved` field. So the offsets could be kept exactly, and the
fields named, with compile-time assertions that they sit where 4.2 put them.

## Layer one: the driver

The driver was the warm-up. Thirteen of its fifteen functions reassemble to
the reference's instructions; the other two match in control flow. Two things
it does are worth mentioning:

- **It computes the frame buffer's length wrongly,** as `bytesPerScanline ×
  xResolution` rather than × `yResolution`. That is Apple's bug, reproduced
  and labelled.
- **Its mode strings always say `Refresh:0Hz`.** The reason only became clear
  one layer down.

## Layer two: the kernel

`VBEModeInfo2IODisplayInfo` translates a VBE mode record into DriverKit's
`IODisplayInfo`. It is a 539-byte leaf function with an inline 31-entry jump
table. It is also where the `Refresh:0Hz` comes from: 4.2 stores a literal
zero into the refresh rate, because the VBE record has no field to take it
from.

A linked kernel has no relocation table, so there was nothing to tell the
comparison which bytes are addresses. The harness instead masks by pattern:
- the `imm32` of the `jmp [eax*4 + table]` dispatch;
- the 31 table entries.

With that in place, **all 411 remaining bytes matched on the first compile.**

`FBAllocateVBEConsole` came out at structural parity. 4.2's compiler had
inlined the existing console allocator into it, and calling that allocator is
the honest way to spell it. Wiring it into `BasicAllocateConsole()` turned up
a pleasant surprise: 4.2's own `_BasicAllocateConsole` is ours plus exactly
nine bytes, the new call and the test of its result.

To prove the driver now links, I booted a kernel *without* the new functions
next to one *with* them, in the same QEMU session. The old kernel produced the
error I wanted to see: `rld(): Undefined symbols: _VBEModeInfo2IODisplayInfo`.
The new one loaded the driver cleanly.

## Layer three: the booter

This was most of the work.

### Finding its load address

The 4.2 booter is headerless: just bytes. To disassemble it, I needed to know
where it loads. The test was simple. Take the file offsets of its
VBE-related strings, try candidate base addresses, and see which base makes
the code's 32-bit operands point at them. At `0x3000`, all twelve operands
naming its eleven VBE strings did. At every other candidate, none did. That is also where Rhapsody's booter loads.

### A hard 45,056-byte ceiling

`boot1` reads 88 sectors into memory at `0x3000`. Before doing that, it has
moved itself to `0xE000`, and `0x3000 + 88 × 512` is exactly `0xE000`. So the
second-stage booter cannot exceed 45,056 bytes without overwriting the code
that is loading it.

Our booter started at 44,576 bytes: 480 bytes spare, and roughly 1 KB of VBE
code to add. Apple's own stock Rhapsody booter on the test image was only
39,616 bytes. So there was fat to find. Trimming removed an unused module
loader, a pair of unused big-endian swap routines, and a dead stack-pointer
helper.

I had hoped to remove `strtol` as well. It is dead in the booter, but the
standalone linker, `sarld`, is built from the same library and still needs
it. That boundary never shows up in a scan of the booter alone.

### The file is not what boots

Writing a new `/usr/standalone/i386/boot` changes nothing. `boot1` reads the
NeXT disk label and loads the booter from the boot blocks it names, of which
there are two copies. So I wrote a small tool to install a booter into both
slots of a test image and read them back by hash.

Every boot capture then had to prove which booter had run. The boot banner 
does just that: ours prints `Rhapsody boot v5.0.2`, Apple's prints `v5.0.41.1`.

### A comparator for code with no relocations

The booter has no symbols and no relocations, so I wrote a comparator on top
of capstone. It requires the two instruction streams to agree exactly. It
masks a 32-bit operand only when both values fall inside their own image's
address range, and every masked address has to map one-to-one across the
whole function.

A review pass caught a hole in it. A branch that stayed inside the function in
one build but jumped out of it in the other was being treated as an "address"
and masked. `jne +1` against `jne +0x64` reported a match. It was one
condition to fix, and one regression test, but a tool that says MATCH is only
worth anything if it can't say it wrongly.

### Running Apple's booter against our disk

Booting the 4.2 booter itself under QEMU was the most direct way to learn how
the reference behaves. It could not read our disk: it assumes a big-endian UFS
superblock, the same bug our own booter had once had. But its `VBE Check`
option needs no filesystem, and it ran. That gave measured ground truth for
the rest of the work:

- **QEMU's VGA BIOS reports VBE 3.0,** on both the Cirrus and the standard
  adapter.
- **The usable-mode lists:** 4.2's filter finds 8 usable modes on Cirrus and
  30 on the standard adapter. Mode 257 (640×480, 8-bit) comes first on both.
- **The version check:** 4.2 accepts any VBE version from 2.0 up. Our
  booter's leftover code demanded *exactly* 2.0, so it would have refused
  QEMU outright.

### The ninetieth record

4.2's mode array holds up to 90 records. In Rhapsody's struct, the 90th record
would run 8 bytes into `boot_video`, a field 4.2's struct never had. That made
the first **forced divergence**: our enumerator stops at 89, leaving the 90th
slot zero for the driver's scan to stop on. It is one changed byte in an
otherwise byte-identical 328-byte function.

### What came across

With the room made, the 4.2 code came across function by function, almost
all at byte parity:

- the mode-record writer;
- the mode filters;
- the enumerator;
- the mode setter;
- the `VBE Mode` lookup in the boot path;
- the `VBE Check` listing, which draws the same pixels as 4.2's own booter on
  the same adapter.

4.2's `setMode` and its VGA "Boot Graphics" panel came across too. Our tree's
planar drawing code turned out to be byte-identical to 4.2's already.

4.2's code also does things you might not guess. It enumerates modes on
*every* boot. It sets the VBE mode as the very last thing before jumping to
the kernel. And it prints nothing at all when that succeeds.

### A use-after-free that 4.2 had avoided

Our booter stores a pointer to each loaded driver's configuration table, then
frees the table. For years nothing read the pointer back. The new `VBE Mode`
lookup does. It worked only because the VBE driver happened to be last in the
load order, so its freed memory had not been reused yet.

With the driver listed *first*, the key vanished and no VBE mode was set. The
fix was to rebuild 4.2's `loadOtherConfigs`, all 716 bytes of it, byte for
byte. It points the table at the permanent copy the booter hands the kernel.

The final booter is 45,008 bytes: 48 bytes under the ceiling.

## Mapping the frame buffer

The last piece is the kernel's. In 4.2, `pmap_bootstrap` maps the frame
buffer's physical address into kernel virtual memory and publishes the address
at `0x12854`. Reading the disassembly confirmed what earlier work had only
inferred: the value really is a mapped virtual address.

As far as I can tell from the code, 4.2 does not reserve that range. Its
mapping sits inside the region the kernel later hands out for its own
allocations. I reserve it instead. I also added a check 4.2 never had, so that
a large frame buffer can't run past the kernel's 1 GB address limit.

### The first run of a console that had never run

The first boot with the mapping in place **triple-faulted, in a reset loop.**
A memory dump taken just before the fault told the story. The frame buffer
held 307,200 bytes of the console's background colour, drawn perfectly
through the new mapping. Then came a write three bytes *before* it.

A frame-buffer console had never run at boot on i386 before, and never on a
640×480 screen. It asked for a 640×480 window, and on a 640×480 screen the
window's border starts at x = -3.

4.2 asks for three-quarters of the screen instead. Rebuilding 4.2's `Init`
made the console readable. That is the screenshot at the top of this post: a
480×360 window, centred, scrolling through the boot.

## Faithful, except where it shouldn't be

The reconstruction is 4.2's bytes wherever that is harmless. Where it
isn't, each difference is a labelled decision:

- **Forced by Rhapsody's layout:** the 89-record cap.
- **A choice:** keeping Rhapsody's 8-bit palette rather than 4.2's. The
  console's colour indices follow it, so its text stays black on white.
- **4.2 bugs, fixed on purpose:**
  - the dangling config pointer, including on a driver-disk path where 4.2
    itself dangles;
  - the unreserved frame-buffer range;
  - frame-buffer alerts that wiped the screen before saving what was under
    them;
  - 4.2 reading the BIOS's segment:offset mode-list pointer as
    `(seg << 16) | off` instead of `seg × 16 + off`.
- **Our own bound:** the 1 GB check on the mapping.

## What's next

Everything here was measured under QEMU, not on real hardware, and that is the
obvious next step.

The desktop still runs on the card-specific driver path. A Window Server
driver for a plain VESA frame buffer would be the natural follow-on here.
