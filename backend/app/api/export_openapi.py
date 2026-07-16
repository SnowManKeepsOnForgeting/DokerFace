"""Script to export FastAPI OpenAPI specification to openapi.json."""

import json
from pathlib import Path

from app.main import create_app


def main() -> None:
    app = create_app()
    openapi_schema = app.openapi()

    out_dir = Path(__file__).resolve().parents[3]
    out_path = out_dir / "openapi.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(openapi_schema, f, indent=2)
        f.write("\n")
    print(f"Exported OpenAPI spec to {out_path}")


if __name__ == "__main__":
    main()
