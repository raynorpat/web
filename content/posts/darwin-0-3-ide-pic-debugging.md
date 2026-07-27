---
title: "Debugging Darwin 0.3: When an IDE Driver Problem Was Really an Interrupt Controller Bug"
date: 2026-07-27T09:00:00-04:00
draft: true
description: "A deep dive into debugging Apple Darwin 0.3, its legacy EIDE driver, QEMU interrupt failures, and a spurious IRQ 15 bug in the cascaded 8259 PIC handling."
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

Working on an operating system from the late 1990s often feels less like ordinary development and more like software archaeology.

Recently, I have been experimenting with Apple's early open-source Darwin code—specifically the Darwin 0.3 i386 kernel and its surrounding driver set. Two problems in the old EIDE stack sent me through PCI controller detection, ATA command recovery, QEMU tracing, and eventually into the kernel's 8259 interrupt-controller code.

What initially looked like two separate IDE driver defects turned into a useful lesson:

> The component reporting the failure is not necessarily the component causing it.

## Hurdle One: The IDE Driver Only Recognized a Small Piece of the PCI World

The first problem was straightforward, at least compared with what came later.

Darwin's `drvEIDE` driver recognized only a short list of Intel PIIX PCI IDE controllers. Its probe routine matched five known device IDs and rejected everything else.

That was already restrictive by the standards of the late 1990s. It became even more confusing because the driver's configuration tables advertised support for later Intel ICH controllers, while the code itself rejected them.

When that happened, the system could fall back to a legacy ISA-style controller personality. The disk might still appear through the traditional `0x1F0` I/O ports and IRQ 14, but important functionality disappeared:

- PCI bus-master DMA
- Controller-specific timing setup
- Proper controller capability detection
- Correct assumptions about interrupt routing
- Higher PIO and Ultra DMA modes

In other words, the disk could appear to work while the driver was operating it through a much less capable—and potentially less reliable—path.

## Reworking the Driver Around Capabilities

Rather than continuing to add device IDs to an allow-list, I restructured the PCI side of the driver around capabilities.

The new design separated the generic PCI IDE machinery from the chipset-specific timing code:

- A generic bus-master IDE core handles PCI discovery, BAR mapping, PRD tables, and the DMA engine.
- A chipset-operations table provides hooks for matching a controller, setting timing, resetting timing, and detecting cable type.
- The Intel backend handles the PIIX and early ICH families.
- A generic backend can attach to other standards-compatible PCI IDE controllers while preserving the BIOS-programmed timing.

Most importantly, controller discovery now uses the PCI class code and programming-interface byte instead of relying exclusively on vendor and device IDs.

This changes the attachment policy from "reject anything unknown" to "use the best backend available."

An Intel controller gets Intel-specific timing support. A generic bus-master controller gets standards-based DMA support. A more limited device can still operate through a conservative PIO path.

The work also exposed several smaller bugs, including:

- A PRD-table memory leak
- A possible double-free after initialization failure
- An incorrect timing calculation for some ICH DMA modes
- A missing build-system source registration
- A configuration-space write that could overwrite a newly programmed register value

That was the first hurdle: modernizing a driver whose architecture assumed that the set of valid hardware was a small, fixed list.

The second hurdle was much more deceptive.

## Hurdle Two: A Disk Interrupt Timeout That Never Recovered

Under QEMU, the EIDE driver would sometimes stop during boot with output similar to this:

```text
hc0: interrupt timeout, cmd: 0xc4
hc0: ATA command c4 failed. Retrying...
hc0: Resetting drives...
hc0: ATA drive 0 is not present.
```

Command `0xC4` is ATA `READ MULTIPLE`.

The status register was especially interesting:

```text
status=0x58
error=0x00
```

`0x58` means the drive is ready and has data waiting:

```text
DRDY | DSC | DRQ
```

The drive was not reporting an error. It had prepared a block of data and was waiting for the host to read it.

The host, meanwhile, was waiting for an interrupt that never arrived.

That looked like a classic lost-interrupt problem.

Unfortunately, the driver's recovery behavior could turn one missed interrupt into a permanent failure.

## The Driver's Zero-Progress Recovery Loop

The driver selected its preferred read command during initialization and cached that choice. If multisector transfers were enabled, it continued issuing `READ MULTIPLE`.

After a command failure, however, the retry path performed a full controller and drive reinitialization. That process could clear the negotiated multisector block size.

The cached command and the live controller state could then disagree:

1. The disk object still issued `READ MULTIPLE`.
2. The controller's current multisector block size was zero.
3. The transfer loop calculated that it should move zero sectors.
4. No bytes were transferred.
5. The remaining sector count never decreased.
6. The driver waited for another interrupt while the drive still had `DRQ` asserted.

The result was a zero-progress loop.

A single transient timeout could therefore leave the driver permanently issuing a command it was no longer configured to execute. The same basic risk existed in the multiple-sector write path.

Several defensive changes came out of that audit:

1. Reject multiple-sector commands when the live block size is zero.
2. Recalculate the appropriate ATA command for each request rather than caching it forever.
3. Revalidate commands during retries, degrading DMA to PIO or multiple-sector I/O to single-sector I/O when necessary.
4. Use a lightweight recovery reset before performing a destructive full reinitialization.
5. Poll the device after an interrupt timeout and accept completed commands when the status shows that the device is no longer busy.
6. Preserve per-drive capability state rather than allowing one drive's failure to disable a feature globally.

These were real driver bugs, and they were worth fixing.

But they were not the underlying cause of the missing interrupts.

## Following the Interrupt Into QEMU

The next step was to trace both IDE activity and CPU interrupt delivery.

The failing command was issued normally:

```text
ide_ioport_write ... Command ... val 0xc4
ide_bus_exec_cmd ... cmd 0xc4
ide_sector_read sector=97120 nsectors=16
```

After that, QEMU produced no further IDE activity until the guest's timeout handler began reading the ATA registers.

The device still reported `0x58`: ready, seek complete, and holding data.

At first, this suggested a QEMU IDE emulation bug. Perhaps the model completed the data preparation but failed to assert IRQ 14.

Disabling multiple-sector transfers did not solve the problem. It merely moved the timeout from `READ MULTIPLE` (`0xC4`) to ordinary `READ SECTOR(S)` (`0x20`).

Additional debug logging showed that once the failure happened, later recovery commands—including `IDENTIFY DEVICE` and `RESTORE`—also stopped receiving interrupts.

In some cases, a command had clearly completed and left the device idle, but the completion interrupt still did not arrive.

That was the key clue: this was no longer a read-command or multisector problem.

IRQ 14 delivery itself had stopped.

## Looking at the 8259 PIC State

Darwin 0.3 targets the traditional dual-8259 interrupt-controller arrangement used by the IBM PC architecture.

The first 8259 handles IRQs 0 through 7. A second, "slave" 8259 handles IRQs 8 through 15 and connects to IRQ 2 on the master.

That cascade is important:

```text
Slave IRQ 14
    |
    v
Slave 8259
    |
    v
Master IRQ 2
    |
    v
CPU
```

When the guest wedged, QEMU's PIC state showed:

```text
pic1: irr=40 imr=bf isr=00
pic0: irr=04 imr=fa isr=04
```

The slave PIC had IRQ 14 pending and unmasked. The disk was requesting service.

The master PIC, however, had IRQ 2 marked "in service." That bit never cleared.

Because an 8259 will not deliver another interrupt of equal or lower priority while one is already in service, the stuck cascade bit blocked every interrupt from the slave PIC:

- IRQ 8: real-time clock
- IRQ 9–11: commonly PCI devices
- IRQ 12: PS/2 mouse
- IRQ 14–15: IDE channels

IRQ 0, the timer, continued running because it has a higher priority than IRQ 2.

That explained the misleading appearance of a healthy system: the scheduler and timeout logic continued executing while disk interrupts were silently blocked.

## The Actual Bug: Mishandling a Spurious Slave Interrupt

The root cause was in `machdep/i386/intr.c`.

The interrupt dispatcher checked for spurious—or "phantom"—interrupts before sending the end-of-interrupt command:

```c
if (((irq == INTR_MASTER_PHANTOM_IRQ &&
      (get_master_isr() & INTR_PHANTOM_IRQ_MASK) == 0)) ||
    ((irq == INTR_SLAVE_PHANTOM_IRQ &&
      (get_slave_isr() & INTR_PHANTOM_IRQ_MASK) == 0))) {
    intr_cnt.phantom++;
    return;
}
```

The code treated spurious IRQ 7 and spurious IRQ 15 as equivalent.

They are not.

### Spurious IRQ 7

For a spurious IRQ 7 on the master PIC, returning without sending an EOI is correct.

The master never set an in-service bit, so there is nothing to clear.

### Spurious IRQ 15

A spurious IRQ 15 is different.

Before the slave reports its spurious interrupt, the master has already acknowledged IRQ 2—the cascade—and marked it as in service.

The slave has nothing to acknowledge, but the master does.

Returning immediately leaves IRQ 2 permanently in service, blocking the entire slave PIC.

The correction is small but critical:

```c
if (irq == INTR_SLAVE_PHANTOM_IRQ &&
    (get_slave_isr() & INTR_PHANTOM_IRQ_MASK) == 0) {
    intr_cnt.phantom++;
    send_master_eoi_command(specific_eoi(INTR_SLAVE_IRQ));
    return;
}
```

Only the master's cascade input needs to be acknowledged in this case.

## Fixing EOI Handling More Broadly

The investigation uncovered another correctness issue in the normal interrupt-completion path.

The original kernel sent a non-specific EOI to both PICs for every interrupt:

```c
outb(INTR_PRIMARY_PORT, command);
outb(INTR2_PRIMARY_PORT, command);
```

This is dangerous when interrupts nest.

A non-specific EOI clears the highest-priority in-service bit, which is not necessarily the interrupt currently being completed.

Sending it to both PICs can also acknowledge an unrelated slave interrupt while servicing an interrupt that came from the master.

The corrected implementation uses specific EOIs and targets only the relevant controllers:

```c
if (irq >= 8) {
    send_slave_eoi_command(specific_eoi(irq - 8));
    send_master_eoi_command(specific_eoi(INTR_SLAVE_IRQ));
} else {
    send_master_eoi_command(specific_eoi(irq));
}
```

For a slave interrupt, the order is:

1. Acknowledge the slave PIC.
2. Acknowledge the cascade input on the master PIC.

This matches the general approach used by other x86 kernels with 8259 support.

## Why the Problem Appeared Under QEMU

The spurious slave interrupts appear to be triggered by a timing race involving timer and disk interrupts.

The recurring sequence was:

```text
Disk IRQ becomes pending
Timer IRQ preempts it
The kernel rewrites the PIC masks
The slave source becomes temporarily masked
The master still holds a latched cascade request
The slave reports a spurious IRQ 15
The real disk IRQ follows later
```

The spurious interrupt itself is not catastrophic.

Similar behavior can occur on real 8259 systems, and mature kernels are designed to acknowledge it safely.

The catastrophe came from returning without clearing the master's cascade bit.

Attempts to eliminate the spurious interrupts entirely produced noisy and inconclusive results. Across repeated boots, the apparent rate varied enough that small improvements or regressions could not be distinguished from ordinary timing variation.

The practical solution was therefore not to prevent every phantom interrupt.

It was to make them harmless, acknowledge the cascade correctly, and continue.

## What I Took Away From This

### Logs Show the Victim, Not Necessarily the Culprit

The IDE driver reported the timeout because it was the component waiting for an event.

The real defect lived in the kernel's interrupt-controller handling.

### Defensive Driver Fixes Still Matter

The PIC bug caused the interrupt loss, but the EIDE driver's stale command selection and zero-progress recovery behavior made the consequences much worse.

Fixing the root cause does not make defensive recovery code unnecessary.

### Hardware State Beats Guesswork

The decisive evidence was not another driver log. It was the PIC state:

```text
Slave IRQ 14 pending
Master IRQ 2 permanently in service
```

Once that state was visible, the remaining possibilities narrowed dramatically.

### Historical Code Requires Historical Context

The distinction between spurious IRQ 7 and IRQ 15 is rooted in the physical topology of cascaded 8259 controllers.

It is easy to miss if the code is read as a generic interrupt abstraction rather than as a direct interface to specific hardware.

### Timing Experiments Need Repetition

Single-run comparisons were nearly useless for measuring this race.

Identical builds produced noticeably different phantom-interrupt counts. For timing-sensitive kernel work, repeated trials and distributions are far more informative than one "before" and one "after" run.

## Closing Thoughts

What began as an attempt to improve an old IDE driver turned into a trip through PCI probing, ATA protocol state, QEMU trace output, serial-console plumbing, and finally the interrupt controller at the center of the machine.

That is part of what makes early Darwin interesting to work on. The boundaries between the kernel, drivers, firmware assumptions, and hardware are thin. A small error in one layer can surface several layers away as a completely different kind of failure.

In this case, the disk did not disappear because it was broken. The EIDE driver did not stop because the ATA command had failed. The interrupt was pending, the device was ready, and the CPU was still running.

One forgotten EOI had effectively disconnected half of the machine.

I'll be pushing fixed up code to the RhapsodiOS github repository at https://github.com/RhapsodiOS/RhapsodiOS when I get the chance.
