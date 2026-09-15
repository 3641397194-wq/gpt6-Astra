"""Compatibility entry point for the shared Node preview/API server."""
from pathlib import Path
import subprocess
import shutil
import sys
node = shutil.which('node')
if not node:
    raise SystemExit('Node.js is required for the interactive file-operation preview.')
try:
    raise SystemExit(subprocess.call([node, str(Path(__file__).with_suffix('.cjs'))]))
except KeyboardInterrupt:
    sys.exit(0)
