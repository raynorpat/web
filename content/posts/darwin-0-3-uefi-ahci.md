---
title: "Booting Darwin 0.3 with UEFI"
date: 2026-09-19T09:00:00-04:00
description: "A deep dive into creating a working modern bootable Apple Darwin 0.3 with a new AHCI driver."
tags:
  - Darwin
  - Apple
  - Kernel Development
  - Device Drivers
  - x86
  - QEMU
  - Retrocomputing
categories:
  - Operating Systems
  - Debugging
---

RhapsodiOS (my fork of Darwin 0.3) now boots to userland under UEFI on QEMU's q35 machine, with its root filesystem on a SATA disk served by an AHCI driver that did not exist when Rhapsody shipped in 1999. Getting there took a 32-bit EFI application, a UFS allocator, a new device driver, and a long run of bugs that only showed up one at a time.

## Why UEFI
Rhapsody's bootloader is a BIOS program. It runs in real mode, calls INT 13h to read the disk, INT 10h to set a video mode, and reads the memory map from INT 15h. Every one of those is gone on a machine that boots without a CSM, and QEMU's q35 with OVMF is such a machine.

The kernel itself asks for much less than the bootloader does. It wants a filled-in KERNBOOTSTRUCT at physical 0x11000 — how much conventional and extended memory there is, which device it booted from, the boot string — and it wants to be entered in 32-bit protected mode with paging off. Nothing in that list requires a BIOS. It only requires somebody to do the work the BIOS used to do.
So the job was to write that somebody: a UEFI application that finds the kernel, loads it, fills in the struct, and jumps.

## The design
Three decisions shaped the whole thing, and all three were about doing less.

Build a 32-bit EFI application, not a 64-bit one. A x86-64 UEFI app would have to drop out of long mode before it could touch a kernel that has never heard of long mode. An IA32 build is already in the right mode when firmware hands it control, and it can call the existing 32-bit helpers directly. OVMF ships an IA32 build, so QEMU can boot one.

Read /mach_kernel out of UFS directly. The alternative was staging a copy of the kernel on the FAT ESP, where UEFI could open it as a file. That means two copies that can drift apart. Instead the loader walks the UFS filesystem itself over EFI_BLOCK_IO, so the kernel it boots is the kernel that is installed.

Reuse boot2's filesystem code without editing it. src/boot-2 already knows how to read UFS. Rather than fork it, the loader replaces the layer underneath: ebiosread and uses_ebios become EFI block reads, and disk.c compiles unchanged on top. The seam is at the BIOS call, not in the filesystem logic.

The result is src/bootefi-1 — about a dozen C files, hand-written minimal EFI headers, and a small assembly stub for the jump. It is built on the host with clang and lld-link, not in the guest, because nothing in 1999 emitted PE32.

## Getting to the handoff
Loading the kernel was the easy half. Handing control to it surfaced a run of failures that had nothing in common except that modern firmware leaves the machine in a state a 1999 kernel does not expect.

## What broke and why

Triple fault on the jump
UEFI runs IA32 with CR4.PAE set. The kernel predates PAE. Clearing CR0.PG first, then zeroing CR4, is the only order that survives.

Kernel overwrote its own boot struct
first_addr0 was left at 0, so pmap_bootstrap built page tables over KERNBOOTSTRUCT at 0x11000. It has to point past the loaded image.

Firmware loaded us into the kernel's memory
OVMF placed the image at 0x400000, inside the range the kernel wants. Fixed by linking at /base:0x08000000 /fixed.

Page 0 unusable
OVMF withholds physical page 0, where boot2 puts its scratch buffer. BIOS_ADDR moved to 0x20000.

Filesystem read garbage
sys.c assumes big-endian UFS, which is right for Darwin's PPC target and wrong for Intel media. The superblock magic reads 54 19 01 00 on disk.

Console output in noise bands
OVMF's GOP leaves Cirrus SR07/CR1B/CR1D set, so text writes landed at banked addresses. The loader resets VGA to standard text mode before jumping.

None of these were subtle once found. All of them were invisible until the one before it was fixed, which is the real cost of bring-up work: the bugs queue up behind each other and you only ever get to see the first one.

## Nothing to boot from
The loader worked, the kernel started, and then it could not find a disk. q35's storage controller is AHCI, and Rhapsody predates AHCI by several years. There is no Apple driver to reconstruct from a reference binary, the way most of this project's drivers are recovered — drvAHCI had to be written from scratch.

That created a second problem. A boot driver has to be inside the disk image, at /private/Drivers/i386/AHCI.config/, and listed in the Boot Drivers key of System.config/Instance0.table. The existing image tooling could overwrite a file in place but could not create one, because it never allocated a block.

So the UFS tooling learned to allocate: cylinder-group bitmaps, inodes, direct and single-indirect blocks, directory entries, and every summary that has to stay consistent with them (cg_cs, fs_cstotal, the rotational and cluster maps). Writes are staged in a cache and flush() is the only thing that touches the image, so a failed run leaves nothing half-written.
The guard rails matter more than the allocator. golden.img is a read-only master that is never booted or written; every writable image is an APFS clone under vm/work; and the tools refuse a destination outside it.

## What fsck found
The allocator shipped with its own checker, ufs_check, which recomputes every bitmap, count, rotational table and cluster map from scratch and compares. It reported the images as clean.
They were not. Booting the guest and running its own /sbin/fsck found four real defects:
• di_blocks was twice the correct value. The unit is fragments times nspf, not 512-byte sectors.
• Directory entry sizes omitted the NUL terminator that DIRSIZ accounts for, so fsck discarded chunks of directories and orphaned ten inodes.
• free_inode cleared the bitmap but left the dinode populated — and fsck reads di_mode, not the bitmap.
• The old-file fragment walk expanded hole pointers, which are zero, and would have happily freed the boot block and superblock.
Every one of those was invisible to a checker written by the same person, on the same day, from the same misunderstanding of the format. The checker and the allocator agreed with each other and both disagreed with UFS. A clean in-house check is evidence that your code is self-consistent, not that it is correct; the only authority on the format is the implementation that has to live with it.
The same shape showed up again with control runs. When the VGA output was garbage, booting the identical image under the old BIOS loader separated "our bug" from "not our bug" in one step.

## AHCI bring-up
With the driver installable, the failures moved into the driver itself.

It would not link. rld() reported _vm_page_size undefined. That is the user-space Mach name; the kernel exports page_size. The same mistake was sitting in drvDEC21142.

Then __udivdi3 was undefined. A debug build at -O0 emitted the 64-bit division helper for a timestamp conversion, and there is no libgcc to link against in a boot driver.

Then the two controllers overlapped. AHCI_ABAR_LENGTH was 0x1100, AHCI's architectural maximum, but the BARs sit 0x1000 apart. Mapping the maximum meant one controller's window covered the next one's registers. The fix is to map only what BAR5 actually decodes.
Then the low-memory pool ran out. Each port's DMA arena came from IOMallocLow, allocated per implemented port rather than per populated one. Two controllers times six ports exhausted the pool and the driver failed with cannot allocate a port object. Empty ports now give their arena back.

After those, a single controller boots cleanly: both ports detect their disks, hd0 and hd1 register, and the kernel reaches root on hd0a and continues into userland.

## Two controllers, one interrupt line
A second AHCI controller was the last thing to try, and it failed in a way that took some pinning down: the disk on the added controller reported IDENTIFY DEVICE failed or returned bad data and never published.
Adding one number to the log settled what kind of failure it was. The command returned -726, which is IO_R_TIMEOUT — the command never completed at all, rather than completing with bad data. That points at interrupt delivery, not at the AHCI registers.

Two control runs then isolated it:
• Swap the disks between controllers. The failure stayed with the controller, not the disk.
• Move the added controller to a different PCI slot. The behaviour tracked the IRQ exactly: at slot 3 it got IRQ 11 and timed out; at slot 4 it got IRQ 10, the same line as the built-in controller, and the second controller was refused with no usable PCI interrupt line.

That refusal looked like a missing feature, so the driver's config tables gained "Share IRQ Levels" = "YES". The refusal went away and both controllers attached — and then neither of them received interrupts. The disk that had been mounting fine now failed its root read with errno = 5.

The answer is in the kernel, in intr_register_irq:
if (dispatch_table[irq].routine)
    return (FALSE);

One handler per IRQ, no chaining. Sharing a line was never possible; the config key only moved the failure from "the second controller is locked out" to "both controllers are deaf". The key was reverted.

## Where it stands
On QEMU q35 with IA32 OVMF, RhapsodiOS boots from a UEFI application, loads its kernel out of UFS, links its boot drivers, mounts root over AHCI and reaches userland. One AHCI controller works completely — both ports, hd0 and hd1, root on hd0a.

## What is still open:
• Multiple AHCI controllers. Workable only when each lands on its own IRQ, and even then the second one's IRQ has to be a line that actually delivers. IRQ 11 does not, in this boot path — likely because the loader hands the kernel no $PIR or ACPI routing table, so it has no idea how PCI interrupts are wired.
• Hardware. Everything so far is QEMU. drvAHCI has never run on a real machine.
• PAE and large memory. The kernel's 1999 assumptions about physical memory are the next thing to revisit, and the UEFI loader already computes most of what that work needs.

See the RhapsodiOS github repository at https://github.com/RhapsodiOS/RhapsodiOS for the new AHCI driver and UEFI bootloader.
