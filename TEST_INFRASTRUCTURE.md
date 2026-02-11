# SecuWatcher Export - Test Infrastructure Setup

This document describes the test infrastructure setup for the SecuWatcher Export project, covering both frontend (Electron/Vue) and backend (FastAPI/Python) testing.

## Overview

The project uses two complementary testing frameworks:
- **Vitest** for frontend (Vue 3 composables, components)
- **pytest** for backend (FastAPI endpoints, utilities)

## 1. Frontend Testing (Vitest)

### Location
- **Project Root**: `/sessions/laughing-wizardly-maxwell/mnt/secu_electron_v3/secuwatcher_electron/`

### Configuration Files

#### `vitest.config.js`
Main Vitest configuration file:
```javascript
- Uses @vitejs/plugin-vue for Vue 3 support
- Test environment: jsdom (simulates browser DOM)
- Coverage provider: v8
- Root directory: src/
- Includes pattern: **/*.test.js
```

#### `src/__tests__/setup.js`
Global test setup file that provides:
- **window.electronAPI mock**: Mocks Electron IPC bridge (invoke, send, on, once, removeListener)
- **HTMLVideoElement mocks**: Simulates video element methods (play, pause)
- **Canvas context mock**: Provides canvas 2D context mocking
- **Test utilities**: Global testConfig helper with mockVideoElement and mockStores

### Test Files

#### `src/__tests__/composables/videoController.test.js`
Sample test suite for the videoController composable with coverage of:

**Test Groups:**
1. **togglePlay** - Tests play/pause state management and video element interaction
2. **jumpForward** - Tests frame-by-frame forward navigation with boundary checks
3. **jumpBackward** - Tests frame-by-frame backward navigation with zero boundary
4. **setPlaybackRate** - Tests playback speed adjustment with rate limits
5. **zoomIn** - Tests zoom level increase and transform application
6. **zoomOut** - Tests zoom level decrease with minimum boundary (0.5)
7. **updateVideoProgress** - Tests progress bar to video time conversion
8. **getMaxPlaybackRate** - Tests max rate based on video duration
9. **isInputFocused** - Tests input/textarea focus detection
10. **handleKeyDown** - Tests keyboard shortcut handling (Space, KeyA, KeyD, ArrowLeft, ArrowRight)

**Test Statistics:**
- 32 test cases
- Covers core video control functionality
- Includes null/edge case handling

### Package.json Scripts

Added test-related npm scripts:
```json
"test": "vitest run"           // Run tests once and exit
"test:watch": "vitest"         // Run tests in watch mode
```

### New Dependencies Added
```json
"@vitest/coverage-v8": "^1.0.4"  // Code coverage reporting
"jsdom": "^23.0.0"               // DOM implementation for jsdom environment
"vitest": "^1.0.4"               // Test framework
```

### Running Tests

**Run all tests once:**
```bash
npm test
```

**Run tests in watch mode (re-run on file changes):**
```bash
npm run test:watch
```

**Run with coverage report:**
```bash
npm test -- --coverage
```

### Test Structure

```
secuwatcher_electron/
├── vitest.config.js
├── src/
│   ├── composables/
│   │   ├── videoController.js
│   │   ├── videoEditor.js
│   │   ├── fileManager.js
│   │   └── ... (other composables)
│   └── __tests__/
│       ├── setup.js
│       └── composables/
│           └── videoController.test.js
```

### Key Features

- **JSdom Environment**: Tests run in a simulated browser environment without Electron dependencies
- **Mock Dependencies**: Electron API and Pinia stores are fully mocked
- **Vue 3 Support**: Plugin configured for testing Vue 3 composition API
- **Coverage Tracking**: Built-in v8 coverage reporting
- **Globals**: Vitest globals enabled (describe, it, expect, etc.)

---

## 2. Backend Testing (pytest)

### Location
- **Project Root**: `/sessions/laughing-wizardly-maxwell/mnt/secu_electron_v3/secuwatcher_python/`

### Configuration Files

#### `pytest.ini`
Main pytest configuration:
```ini
[pytest]
minversion = 7.0
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
```

**Configuration Details:**
- **minversion**: Requires pytest 7.0 or higher
- **testpaths**: Tests located in `tests/` directory
- **python_files**: Files matching `test_*.py` pattern
- **python_classes**: Test classes matching `Test*` pattern
- **python_functions**: Test functions matching `test_*` pattern
- **addopts**: Verbose output with short traceback format

#### `conftest.py`
Shared pytest fixtures and configuration:

**Fixtures Provided:**

1. **test_client** - FastAPI TestClient
   - Creates a test client for making HTTP requests to the API
   - Raises skip if app cannot be imported
   - Returns: `TestClient` instance

2. **temp_config_dir** - Temporary directory
   - Creates a temporary directory for test configuration files
   - Auto-cleaned up after test
   - Returns: Directory path (str)

3. **mock_config_file** - Mock configuration file
   - Creates a config.ini file in temp directory with sample settings
   - Contains sections: DEFAULT, server, detection
   - Returns: Path to config.ini file

4. **app_instance** - FastAPI app instance
   - Provides direct access to the FastAPI application
   - Returns: FastAPI app instance

### Test Files

#### `tests/__init__.py`
Package initialization file (empty but required for package structure)

#### `tests/test_health.py`
Sample test suite for server health checks and basic endpoints

**Test Classes and Cases:**

**TestHealthEndpoints** (6 test cases)
- `test_root_endpoint_exists` - Verifies root endpoint accessibility
- `test_root_endpoint_returns_valid_response` - Checks response validity
- `test_app_instance_is_fastapi` - Validates FastAPI app instance
- `test_app_has_cors_middleware` - Verifies CORS middleware setup
- `test_test_client_creation` - Tests TestClient creation
- `test_invalid_endpoint_returns_404` - Validates 404 responses

**TestServerBasics** (3 test cases)
- `test_openapi_schema_available` - Checks OpenAPI schema at /openapi.json
- `test_swagger_ui_available` - Verifies Swagger UI at /docs
- `test_redoc_available` - Verifies ReDoc at /redoc

**TestMockConfigFile** (2 test cases)
- `test_mock_config_file_creation` - Validates file creation and structure
- `test_mock_config_file_readable` - Tests ConfigParser compatibility

**TestTemporaryDirectory** (2 test cases)
- `test_temp_config_dir_exists` - Checks temp directory creation
- `test_temp_config_dir_cleanup` - Verifies cleanup (implicit)

**Test Statistics:**
- 13 test cases total
- Covers server health, API endpoints, and fixtures
- Includes configuration and temporary directory tests

### Running Tests

**Run all tests:**
```bash
pytest
```

**Run tests with verbose output:**
```bash
pytest -v
```

**Run specific test file:**
```bash
pytest tests/test_health.py
```

**Run specific test class:**
```bash
pytest tests/test_health.py::TestHealthEndpoints
```

**Run specific test case:**
```bash
pytest tests/test_health.py::TestHealthEndpoints::test_root_endpoint_exists
```

**Run with coverage:**
```bash
pytest --cov=. --cov-report=html
```

**Run with markers:**
```bash
pytest -m "not slow"
```

**Watch mode (requires pytest-watch):**
```bash
ptw
```

### Test Structure

```
secuwatcher_python/
├── pytest.ini
├── conftest.py
├── main.py
├── tests/
│   ├── __init__.py
│   ├── test_health.py
│   └── (future test modules)
```

### Key Features

- **FastAPI TestClient**: Built on httpx, supports all HTTP methods
- **Temporary File Handling**: Fixtures manage temp files automatically
- **Mock Configuration**: Sample config.ini fixture for testing
- **Flexible Fixtures**: Can be used across multiple test modules
- **Verbose Output**: Default verbose mode with short tracebacks
- **Configurable**: pytest.ini allows easy customization

---

## Development Workflow

### Adding New Frontend Tests

1. Create test file in appropriate subdirectory: `src/__tests__/{module}/*.test.js`
2. Import the composable to test
3. Use Vitest globals (describe, it, expect, beforeEach, afterEach)
4. Mock dependencies in beforeEach
5. Run: `npm test` or `npm run test:watch`

**Example structure:**
```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createYourComposable } from '../../composables/yourComposable';

describe('createYourComposable', () => {
  let deps;

  beforeEach(() => {
    deps = { /* mocks */ };
  });

  it('should do something', () => {
    const composed = createYourComposable(deps);
    expect(composed.method()).toBeTruthy();
  });
});
```

### Adding New Backend Tests

1. Create test file in `tests/`: `tests/test_*.py`
2. Use pytest naming conventions (test_* functions/classes)
3. Use fixtures from conftest.py
4. Run: `pytest` or `pytest tests/test_yourmodule.py`

**Example structure:**
```python
import pytest

class TestYourFeature:
    """Tests for your feature"""

    def test_something(self, test_client):
        """Test description"""
        response = test_client.get("/your/endpoint")
        assert response.status_code == 200
```

---

## Coverage Reports

### Frontend Coverage
```bash
npm test -- --coverage
```
Generates: HTML report in `coverage/` directory

### Backend Coverage
```bash
pytest --cov=. --cov-report=html
```
Generates: HTML report in `htmlcov/` directory

---

## CI/CD Integration

### GitHub Actions Example (Frontend)
```yaml
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm test -- --coverage
```

### GitHub Actions Example (Backend)
```yaml
- name: Run tests
  run: pytest

- name: Generate coverage
  run: pytest --cov=. --cov-report=html
```

---

## Troubleshooting

### Frontend Issues

**Issue**: "Cannot find module '@vitejs/plugin-vue'"
**Solution**: Run `npm install` to install dev dependencies

**Issue**: "jsdom environment not available"
**Solution**: Ensure `jsdom` is installed: `npm install --save-dev jsdom`

**Issue**: "window.electronAPI is undefined"
**Solution**: This is expected in tests; it's mocked in setup.js

### Backend Issues

**Issue**: "ModuleNotFoundError: No module named 'main'"
**Solution**: Ensure you're running pytest from the project root

**Issue**: "TestClient import error"
**Solution**: Install FastAPI: `pip install fastapi httpx pytest`

**Issue**: "conftest.py not found"
**Solution**: Ensure conftest.py is in the project root (not in tests/)

---

## Next Steps

### Frontend
- Add tests for other composables (videoEditor, fileManager, detectionManager, etc.)
- Add Vue component tests using @vue/test-utils
- Add Pinia store tests
- Integrate with CI/CD pipeline
- Set up code coverage thresholds

### Backend
- Add endpoint tests for /autodetect, /autoexport, /progress endpoints
- Add database/model tests
- Add validation tests for request/response schemas
- Add error handling tests
- Add integration tests

---

## Resources

### Vitest
- Documentation: https://vitest.dev
- Vue Testing: https://vitest.dev/guide/testing-libraries
- Coverage: https://vitest.dev/guide/coverage

### pytest
- Documentation: https://docs.pytest.org
- FastAPI Testing: https://fastapi.tiangolo.com/advanced/testing-events/
- Fixtures: https://docs.pytest.org/en/stable/how-to-fixtures.html
