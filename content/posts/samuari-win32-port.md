---
title: "Ninja-ing Like It’s 1996: Porting samurai to MSVC 4.2"
date: 2026-07-13
description: "Time-Traveling C: Porting a C99 Linux Build Tool to Windows via MSVC 4.2"
---

# Ninja-ing Like It’s 1996: Porting samurai to MSVC 4.2

There is a strange, intoxicating joy in retro-computing. Sometimes it’s running Windows NT on an old ThinkPad; other times, it’s trying to compile a modern C99 build tool with a compiler that hasn't seen an update since Bill Clinton's first presidential term.

Recently, I set my sights on [**samurai**](https://github.com/michaelforney/samurai), a beautifully minimal clone of the Ninja build system written in C99. It’s light, clean, and POSIX-focused. My goal? Port it to Windows using **Microsoft Visual C++ 4.2**, released back in 1996. I wanted the ability to use native ninja build files for a separate retro-development project I'm working on, and using a modern toolchain felt like cheating. 

For context, MSVC 4.2 was built for the early days of Win32 programming, targeting Windows 95 and NT 4.0 application development. It implements a strict flavor of ANSI C (essentially C89) and knows absolutely nothing about modern C99 standards, let alone `<stdbool.h>`, `<stdint.h>`, or inline variable declarations. 

To keep the codebase maintainable without turning the core logic into an unreadable mess of `#ifdefs`, my strategy relied on two architectural anchors: a C99 compatibility header (`compat.h`) to bridge the language gap, and a standalone `os-windows.c` to contain the Win32 platform madness. Here is how I survived the compiler errors, rewrite cycles, and API gaps to make it happen.

---

## C89 vs. C99: Fighting the Syntax Clock

The moment you feed modern C99 into MSVC 4.2, the compiler absolutely panics. Before you can even begin addressing OS-specific features like files or processes, you have to completely demote the language syntax by a decade.

### 1. The Variable Declaration Trap
In C99, we take declaring variables anywhere for granted—especially inside loops. In MSVC 4.2, all variables *must* be declared at the very top of a scope block. 

```c
// C99 (What samurai wanted)
for (size_t i = 0; i < edge->out_count; i++) { ... }

// C89 (What MSVC 4.2 demanded)
size_t i;
for (i = 0; i < edge->out_count; i++) { ... }
```

If you forget even a single variable declaration loop counter or temporary flag, MSVC throws a cascade of cryptic syntax errors that make it look like the entire file is broken. I spent hours manually hoisting loop counters and temporary flags to the top of blocks.

### 2. Inventing Modern Types out of Thin Air

Because MSVC 4.2 predates C99, headers like <stdint.h> and <stdbool.h> simply do not exist.

* Booleans: bool, true, and false are completely missing. I had to map these to custom types (typedef int bool;) inside compat.h.

* 64-bit Integers: C89 has no concept of standard long long for fixed-width 64-bit math. However, MSVC 4.2 did have a proprietary Microsoft extension: the __int64 keyword. In compat.h, I tied the modern standard types to this ancient extension:
```c
typedef __int64 int64_t;
typedef unsigned __int64 uint64_t;
```

---

## The NT4 CRT Nightmare: Standard `printf` Cannot Handle 64-bit Ints

A build tool lives and dies by 64-bit integers. It uses them to track high-precision file modification timestamps and to parse cryptographic hashes. Modern C gives us standard macros like PRIu64 to easily format these values for printf or log files.

Later versions of MSVC introduced the %I64 format specifier to bridge this gap. But under MSVC 4.2 targeting the ancient Windows NT 4.0 C Runtime (CRT)? It doesn't exist. If you pass a 64-bit integer to fprintf using standard format specifiers, it either truncates the data or completely blows up the stack frame.

My solution was to bypass the CRT's formatting string engine entirely for 64-bit types. I wrote manual, low-level string conversion helpers inside compat.h:

```c
/* format a 64-bit value into buf without printf's %I64 (the NT4 CRT printf
 * does not support it). buf must hold >= 21 bytes (i64dec) / >= 17 (u64hex).
 * returns buf, so it can be passed inline to a %s argument. */
char *i64dec(char *buf, int64_t v);
char *u64hex(char *buf, uint64_t v);
```

### Implementing Safe 64-Bit Division by Hand

Because I couldn't rely on the compiler's runtime library to print these safely, I had to implement standard string-buffer filling loops using modulo and division. 

One elegant detail from the implementation of `i64dec` was safely handling the absolute value of `INT64_MIN`. If you simply negate the minimum possible signed 64-bit integer, you trigger signed overflow (undefined behavior). The workaround was bitwise precision:

```c
if (v < 0) {
    neg = 1;
    u = (uint64_t)(-(v + 1)) + 1; /* negate without INT64_MIN overflow */
} else {
    u = (uint64_t)v;
}
```

By manually walking the digits backwards into a temporary buffer and flipping them into the destination array, I could safely print log records without relying on standard formatters:

```c
char mbuf[21], hbuf[17];
fprintf(logfile, "0\t%s\t%s\t%s\n",
        i64dec(mbuf, n->logtime), n->path->s, u64hex(hbuf, n->hash));
```

---

## The Win32 File Renaming Gotcha

Another classic divergence between POSIX and Win32 is how the operating system handles file system updates. When `samurai` finishes writing a build log, it writes to a temporary file (`logtmppath`) and then renames it over the production log (`logpath`).

On Linux/POSIX, `rename()` is fundamentally atomic and ruthlessly overwrites whatever file already exists at the destination path. 

On Windows, the standard ISO C `rename()` function wraps the Win32 API—which historically **fails explicitly if the target file already exists.** 

```c
#ifdef _WIN32
    remove(logpath); /* Win32 rename() can't replace an existing file */
#endif
    if (rename(logtmppath, logpath) < 0)
        fatal("build log rename:");
```

By adding a preemptive `remove()` wrapped in a `_WIN32` guard, samurai avoids a silent failure that would otherwise leave you wondering why your build logs were never updating.

---

## The Architecture: `compat.h` and `os-windows.c`

Rather than littering the core logic of samurai with an unreadable web of inline #ifdef blocks, the entire port relies on strict architectural isolation. samurai was fortunately designed with a relatively clean separation of concerns, which allowed me to isolate the language deficiencies into a compatibility shim and drop in a native Win32 backend without touching the core build engine logic.

### 1. compat.h: The Language Time-Capsule Wrapper

The goal of compat.h is semantic translation: making a 1996 compiler understand modern C99 idioms without rewriting the codebase's core algorithms. Because MSVC 4.2 has no idea what a uint32_t or a bool is, compat.h acts as an interception layer included at the very top of every translation unit.

* Type Mapping: It intercepts missing C99 standard headers and maps standard types directly to MSVC’s proprietary extensions (like wrapping __int64 into int64_t and uint64_t).

* Bypassing the Format Engine: This is also where our custom i64dec and u64hex helpers are declared. By making these functions return a pointer to the destination buffer, they can be evaluated inline directly inside standard fprintf statements, completely mimicking the clean developer experience of standard printf macros without relying on the broken NT4 CRT format engine.  

### 2. os-windows.c: Bridging the POSIX-to-Win32 Gap

While compat.h handles the language syntax, os-windows.c solves the structural operating system mismatch. samurai naturally isolates its OS-dependent features into platform files. By providing a clean implementation of these required hooks, I completely replaced the POSIX platform layer with native Win32 subsystems.

#### The Process Spawning Engine (CreateProcessA)

The original Linux implementation relies on the classic POSIX model: fork() to clone the process, dup2() to wire up stdout/stderr pipes, and execvp() to execute the build command. Windows has no concept of a cheap fork().

Inside os-windows.c, the execution loop was entirely rewritten around CreateProcessA. This meant managing the verbose Win32 process setup lifecycle:

* Handle Inheritance: Creating anonymous pipes for tracking child process output logs, ensuring that the write-ends of the pipes are explicitly marked as inheritable handles.

* Startup Info Configuration: Populating the STARTUPINFOA structure to manually map the inherited pipe handles to hStdOutput and hStdError, while forcing the STARTF_USESTDHANDLES flag.

* Process Tracking: Capturing the PROCESS_INFORMATION handles (hProcess and hThread) to safely monitor execution, harvest exit codes via GetExitCodeProcess, and properly close handles to prevent massive kernel resource leaks during multi-threaded builds.

#### High-Resolution File Timestamps

A build system lives and dies by file system modification times to determine if an object is stale. POSIX stat() provides nanosecond precision via st_mtim. The standard stat() function shipped with MSVC 4.2's vintage CRT provides nowhere near the precision required.

To fix this, os-windows.c bypasses the CRT file APIs entirely:

* It queries the file system using native Win32 GetFileAttributesExA calls, populating a WIN32_FILE_ATTRIBUTE_DATA structure.

* It extracts the ftLastWriteTime (a 64-bit FILETIME structure representing 100-nanosecond intervals since January 1, 1601).

* It mathematically translates this FILETIME value into a standardized internal 64-bit timestamp epoch that the core samurai engine can reason about uniformly across platforms.

By cleanly separating the time-travel syntax fixes from the native Win32 platform code, the core code remains elegant, pristine, and completely oblivious to the fact that it is being compiled by a 30-year-old toolchain.

---

## Conclusion

Porting software to a 30-year-old compiler forces you to stop taking modern standard libraries for granted. Having to write your own base-10 string conversion functions just to log a timestamp is a stark reminder of how far tooling has come.

The resulting build is highly rewarding: a completely native, dependency-free executable compiled using software from 1996 that can seamlessly drive modern Ninja build pipelines on a modern machine. It solved the exact toolchain problem I needed for several vintage code projects, proving that good, minimal C design stands the test of time—even when dragged backward through it.

If you want to view the full `compat.h` architecture, peek at the custom string parsing routines, or try the build yourself, check out the repository commit history: [github.com/raynorpat/samurai](https://github.com/raynorpat/samurai).
