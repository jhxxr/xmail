@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo ====================================
echo Start deploying XMail to Cloudflare
echo ====================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pnpm not found. Please install pnpm ^(>=10^).
    exit /b 1
)

if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call pnpm install --frozen-lockfile
    if errorlevel 1 (
        echo Dependency installation failed.
        exit /b %errorlevel%
    )
) else (
    echo [1/3] Dependencies exist, skip install
)
echo.

echo [2/3] Deploying Web + Email Worker...
call pnpm run deploy
if errorlevel 1 (
    echo Deploy failed.
    exit /b %errorlevel%
)
echo.

echo [3/3] Deploy complete
echo ====================================
echo Cloudflare Pages and Worker are deployed
echo ====================================

endlocal
exit /b 0
