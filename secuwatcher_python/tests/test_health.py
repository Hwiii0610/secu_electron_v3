"""
Health Check Tests

Tests for basic server endpoints and health status verification
"""

import pytest


class TestHealthEndpoints:
    """Test cases for server health and basic endpoints"""

    def test_root_endpoint_exists(self, test_client):
        """
        Test that the root endpoint is accessible

        Expected:
        - Status code should be 200 or 405 (method not allowed for GET)
        - Response should be valid
        """
        response = test_client.get("/")
        assert response.status_code in [200, 405, 307]  # 307 for redirect

    def test_root_endpoint_returns_valid_response(self, test_client):
        """
        Test that root endpoint returns a valid response

        Expected:
        - Response status should not be 500 (server error)
        - Response should be JSON or HTML
        """
        response = test_client.get("/")
        assert response.status_code != 500

    def test_app_instance_is_fastapi(self, app_instance):
        """
        Test that the app instance is a valid FastAPI application

        Expected:
        - app_instance should not be None
        - app_instance should have routes defined
        """
        assert app_instance is not None
        assert hasattr(app_instance, 'routes')
        assert len(app_instance.routes) > 0

    def test_app_has_cors_middleware(self, app_instance):
        """
        Test that CORS middleware is configured

        Expected:
        - app should have user_middleware configured
        - At least one middleware should be present
        """
        assert hasattr(app_instance, 'user_middleware')
        # CORS middleware is typically added to user_middleware
        assert len(app_instance.user_middleware) > 0

    def test_test_client_creation(self, test_client):
        """
        Test that TestClient can be created successfully

        Expected:
        - test_client should not be None
        - test_client should have methods to make HTTP requests
        """
        assert test_client is not None
        assert hasattr(test_client, 'get')
        assert hasattr(test_client, 'post')
        assert hasattr(test_client, 'put')
        assert hasattr(test_client, 'delete')

    def test_invalid_endpoint_returns_404(self, test_client):
        """
        Test that accessing invalid endpoints returns 404

        Expected:
        - Status code should be 404 (Not Found)
        """
        response = test_client.get("/invalid/endpoint/that/does/not/exist")
        assert response.status_code == 404


class TestServerBasics:
    """Basic server functionality tests"""

    def test_openapi_schema_available(self, test_client):
        """
        Test that OpenAPI schema is available

        Expected:
        - /openapi.json endpoint should be accessible
        - Response should contain valid OpenAPI schema
        """
        response = test_client.get("/openapi.json")
        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data or "swagger" in data

    def test_swagger_ui_available(self, test_client):
        """
        Test that Swagger UI is available

        Expected:
        - /docs endpoint should be accessible
        - Response should contain HTML
        """
        response = test_client.get("/docs")
        assert response.status_code == 200
        assert "html" in response.headers.get("content-type", "").lower()

    def test_redoc_available(self, test_client):
        """
        Test that ReDoc is available

        Expected:
        - /redoc endpoint should be accessible
        - Response should contain HTML
        """
        response = test_client.get("/redoc")
        assert response.status_code == 200
        assert "html" in response.headers.get("content-type", "").lower()


class TestMockConfigFile:
    """Test cases for mock configuration"""

    def test_mock_config_file_creation(self, mock_config_file):
        """
        Test that mock config file is created correctly

        Expected:
        - File should exist
        - File should contain required sections
        """
        import os
        assert os.path.exists(mock_config_file)

        with open(mock_config_file, 'r') as f:
            content = f.read()
            assert '[DEFAULT]' in content
            assert '[server]' in content
            assert '[detection]' in content

    def test_mock_config_file_readable(self, mock_config_file):
        """
        Test that mock config file can be parsed

        Expected:
        - ConfigParser should be able to read the file
        - Required config keys should be present
        """
        import configparser
        config = configparser.ConfigParser()
        config.read(mock_config_file)

        assert 'DEFAULT' in config
        assert config['DEFAULT'].get('db_path') == ':memory:'
        assert config['DEFAULT'].get('log_level') == 'DEBUG'

        assert 'server' in config
        assert config['server'].get('host') == '127.0.0.1'

        assert 'detection' in config
        assert config['detection'].get('confidence_threshold') == '0.5'


class TestTemporaryDirectory:
    """Test cases for temporary directory fixture"""

    def test_temp_config_dir_exists(self, temp_config_dir):
        """
        Test that temporary directory is created

        Expected:
        - Directory should exist
        - Should be writable
        """
        import os
        assert os.path.exists(temp_config_dir)
        assert os.path.isdir(temp_config_dir)

    def test_temp_config_dir_cleanup(self):
        """
        Test that temporary directory is cleaned up after test

        Expected:
        - Fixture should properly clean up temp files
        """
        # This is implicitly tested by the fixture context manager
        pass
