# Third-party licences

Generated 2026-11-02 from the installed packages' own metadata and licence files (not from memory).
IELTS Pilot is a personal, non-distributed tool (docs/DECISIONS.md D-001); this list exists so that
nothing of unknown licence ships inside the installer.

## Shipped inside the installer

### Desktop shell
| Component | Version | Licence | Notes |
|---|---|---|---|
| Electron | 45.2.1 | MIT | Bundles Chromium and Node.js; their licences ship with the app as `LICENSE.electron.txt` and `LICENSES.chromium.html` in the install folder |

### UI (bundled into the frontend JavaScript)
| Package | Version | Licence |
|---|---|---|
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| scheduler | 0.28.0 | MIT |

### Backend (bundled by PyInstaller)
| Package | Version | Licence |
|---|---|---|
| CPython | 3.12.x | PSF-2.0 |
| PyInstaller bootloader | 6.22.3 | GPL-2.0 **with Bootloader Exception** — permits embedding the bootloader in programs of any licence (verified in PyInstaller's `COPYING.txt`) |
| alembic | 1.20.1 | MIT |
| annotated-doc | 0.0.5 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyio | 4.16.0 | MIT |
| click | 8.5.0 | BSD-3-Clause |
| fastapi | 0.162.0 | MIT |
| h11 | 0.16.0 | MIT |
| idna | 3.20 | BSD-3-Clause |
| Mako | 1.4.3 | MIT |
| MarkupSafe | 3.0.4 | BSD-3-Clause |
| opentelemetry-api | 1.45.2 | Apache-2.0 |
| pydantic | 2.14.2 | MIT |
| pydantic_core | 2.50.2 | MIT |
| SQLAlchemy | 2.1.6 | MIT |
| starlette | 1.10.0 | BSD-3-Clause |
| typing_extensions | 4.16.0 | PSF-2.0 |
| typing-inspection | 0.4.4 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |

## Build and test tools only (not shipped)

| Tool | Version | Licence |
|---|---|---|
| PyInstaller (build tool) | 6.22.3 | GPL-2.0 with Bootloader Exception |
| pyinstaller-hooks-contrib | 2026.9 | GPL-2.0 / Apache-2.0 (dual) |
| pytest | 9.2.0 | MIT |
| httpx | 0.28.1 | BSD-3-Clause |
| ruff | 0.17.3 | MIT |
| vite | 8.3.5 | MIT |
| @vitejs/plugin-react | 6.2.1 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| electron-builder | 26.18.0 | MIT |

## Study content

No third-party study content is in the repository or the installer (docs/CONTENT_POLICY.md §2–3).
