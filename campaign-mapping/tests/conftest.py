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
