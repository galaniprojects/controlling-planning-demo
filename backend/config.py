import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'creta_demo.db')}"
DEMO_DATE = "2026-02"
SEED_DIR = os.path.join(BASE_DIR, "seed")
FIXTURES_DIR = os.path.join(SEED_DIR, "fixtures")
