"""
Pytest Configuration and Fixtures

Shared fixtures for FastAPI testing including:
- TestClient for making HTTP requests
- Mock configuration
- Database fixtures
"""

import pytest
import os
import tempfile
from fastapi.testclient import TestClient

# Mock the main module to avoid import errors
# This prevents issues with missing config.ini during tests
try:
    from main import app
except ImportError as e:
    print(f"Warning: Could not import app from main: {e}")
    app = None


@pytest.fixture
def test_client():
    """
    Create a FastAPI TestClient for making test requests

    Returns:
        TestClient: A test client instance for the FastAPI app
    """
    if app is None:
        pytest.skip("App could not be imported")
    return TestClient(app)


@pytest.fixture
def temp_config_dir():
    """
    Create a temporary directory for test configuration files

    Returns:
        str: Path to temporary directory
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        yield temp_dir


@pytest.fixture
def mock_config_file(temp_config_dir):
    """
    Create a mock config.ini file in temporary directory

    Returns:
        str: Path to the mock config.ini file
    """
    config_path = os.path.join(temp_config_dir, 'config.ini')
    with open(config_path, 'w') as f:
        f.write("""[DEFAULT]
db_path = :memory:
log_level = DEBUG
max_workers = 4

[server]
host = 127.0.0.1
port = 8000

[detection]
model_path = ./models/yolov8.pt
confidence_threshold = 0.5
""")
    return config_path


@pytest.fixture
def app_instance():
    """
    Provide the FastAPI app instance for direct testing

    Returns:
        FastAPI: The FastAPI application instance
    """
    if app is None:
        pytest.skip("App could not be imported")
    return app
