import pytest

from campaign_mapping.db import connect, init_db
from campaign_mapping.seed import seed_taxonomy


@pytest.fixture
def conn():
    """A fresh in-memory database: the schema and the empty root ruleset version."""
    connection = connect()
    init_db(connection)
    yield connection
    connection.close()


@pytest.fixture
def seeded(conn):
    """The fictional Zestify network, with its campaign product lineups at version 2."""
    seed_taxonomy(conn)
    return conn


@pytest.fixture(scope="session")
def demo_db(tmp_path_factory):
    """The demo database, built once: taxonomy, the synthetic strings and the starter ruleset. Copy before changing."""
    from campaign_mapping.demo import build_demo_db

    return build_demo_db(tmp_path_factory.mktemp("demo") / "demo.db")
