"""Stop the backend when the app that started it is gone (crash, Task Manager, kill).

Electron passes its PID in IP_PARENT_PID. Without this an orphaned backend would keep
the database open until the next reboot.
"""

import logging
import os
import sys
import threading
import time
from collections.abc import Callable

log = logging.getLogger("ielts_pilot")

POLL_SECONDS = 2.0


def _windows_wait(pid: int) -> bool:
    """Block until the process exits. False if it cannot be watched."""
    import ctypes

    synchronize = 0x00100000
    infinite = 0xFFFFFFFF
    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
    handle = kernel32.OpenProcess(synchronize, False, pid)
    if not handle:
        return False
    try:
        kernel32.WaitForSingleObject(handle, infinite)
    finally:
        kernel32.CloseHandle(handle)
    return True


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def watch_parent(on_gone: Callable[[], None], pid: int | None = None) -> threading.Thread | None:
    if pid is None:
        raw = os.environ.get("IP_PARENT_PID", "")
        if not raw.isdigit():
            return None
        pid = int(raw)

    def run() -> None:
        if sys.platform == "win32":
            if not _windows_wait(pid):
                log.warning("cannot watch parent process %s", pid)
                return
        else:
            while _alive(pid) and os.getppid() == pid:
                time.sleep(POLL_SECONDS)
        log.warning("parent process %s is gone; stopping", pid)
        on_gone()

    thread = threading.Thread(target=run, name="parent-watchdog", daemon=True)
    thread.start()
    return thread
