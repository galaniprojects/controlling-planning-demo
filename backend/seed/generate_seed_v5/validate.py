"""v5 seed-data validation.

Re-authored from `generate_seed/validate.py` for the v5 schema. Owned by
T3 (scenarios + workflow); reads the entity roster from chargeable_entities
rather than hardcoding v4 IDs. Stub until T3 ports the rules.
"""
import sys


def main() -> int:
    print("validate.py: stub (no checks run)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
