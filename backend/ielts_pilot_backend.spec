# -*- mode: python ; coding: utf-8 -*-
# PyInstaller build for the IELTS Pilot backend (onedir).
# Build:  pyinstaller ielts_pilot_backend.spec --noconfirm --clean

import os

CATALOG = os.path.join(SPECPATH, "..", "content", "catalog")

a = Analysis(
    ["run_backend.py"],
    pathex=["."],
    binaries=[],
    # Alembic loads env.py and revision files from disk at runtime; the resource
    # catalogue CSVs are read at every start (app/catalog.py).
    datas=[("migrations", "migrations"), (CATALOG, "catalog")],
    hiddenimports=[
        "app.models",
        "csv",
        "logging.config",
        "sqlalchemy.dialects.sqlite",
        "alembic.ddl.sqlite",
        "alembic.runtime.migration",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ielts_pilot_backend",
    debug=False,
    strip=False,
    upx=False,
    console=True,  # hidden by Electron (windowsHide); keeps logs visible when run by hand or in CI
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="ielts_pilot_backend",
)
