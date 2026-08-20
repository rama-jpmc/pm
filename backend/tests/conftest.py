import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Point the app at a throwaway database so test runs are isolated from the
# local dev database and from each other, and are safe to re-run.
os.environ["KANBAN_DB_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")
