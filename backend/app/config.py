"""Runtime settings, read from environment variables set by the Electron main process.

Secrets are passed through the environment, not the command line, because other
processes on the machine can read a process's command line.
"""

import os
from dataclasses import dataclass
from pathlib import Path

# Refuse disk-heavy operations (backups now, recordings later) below this free space (R-02).
MIN_FREE_BYTES = 500 * 1024 * 1024


@dataclass(frozen=True)
class Settings:
    port: int
    token: str
    data_dir: Path
    # Set for one start by the app's "go back to a compatible backup" button, after the
    # owner installed an older version than the one that last changed the database.
    restore_compatible: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        missing = [k for k in ("IP_PORT", "IP_TOKEN", "IP_DATA_DIR") if not os.environ.get(k)]
        if missing:
            raise ValueError(f"Missing environment variable(s): {', '.join(missing)}")
        try:
            port = int(os.environ["IP_PORT"])
        except ValueError as exc:
            raise ValueError("IP_PORT must be an integer") from exc
        if not 1024 <= port <= 65535:
            raise ValueError("IP_PORT must be between 1024 and 65535")
        token = os.environ["IP_TOKEN"]
        if len(token) < 32:
            raise ValueError("IP_TOKEN must be at least 32 characters")
        return cls(
            port=port,
            token=token,
            data_dir=Path(os.environ["IP_DATA_DIR"]),
            restore_compatible=os.environ.get("IP_RESTORE_COMPATIBLE") == "1",
        )

    @property
    def db_path(self) -> Path:
        return self.data_dir / "data" / "ielts_pilot.db"

    @property
    def log_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def recordings_dir(self) -> Path:
        return self.data_dir / "recordings"

    @property
    def library_dir(self) -> Path:
        return self.data_dir / "library"
