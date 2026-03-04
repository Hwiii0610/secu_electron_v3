@echo off
chcp 65001 >nul
cd /d %~dp0

if exist venv (
  if exist .installed goto activate
)

echo [1/2] Python 가상환경 생성 중...
python -m venv venv
if errorlevel 1 goto err_venv

echo [2/2] 패키지 설치 중 (torch CUDA 포함, 처음 실행 시 수십 분 소요)...
call venv\Scripts\activate.bat
python install_deps.py
if errorlevel 1 goto err_pip
echo. > .installed
goto run

:activate
call venv\Scripts\activate.bat

:run
echo.
echo SecuWatcher Python 백엔드 시작 중...
echo 주소: http://127.0.0.1:5001
echo API 문서: http://127.0.0.1:5001/docs
echo 종료하려면 Ctrl+C 를 누르세요.
echo.
uvicorn main:app --host 127.0.0.1 --port 5001
pause
goto :eof

:err_venv
echo [오류] Python 가상환경 생성 실패. Python 3.10+ 설치 여부를 확인하세요.
pause
goto :eof

:err_pip
echo [오류] 패키지 설치 실패. 오류 메시지를 확인하세요.
pause
goto :eof
