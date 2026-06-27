import os
import pytest

from website import create_app
from website import db as database


@pytest.fixture
def app():
    os.environ['SECRET_KEY'] = 'test-secret'
    os.environ['DATABASE_URL'] = 'sqlite:///:memory:'

    app = create_app()
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False

    with app.app_context():
        database.drop_all()
        database.create_all()
        yield app
        database.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def test_home_redirects_to_login_for_unauthenticated_user(client):
    response = client.get('/home')
    assert response.status_code == 302
    assert '/login' in response.headers['Location']
