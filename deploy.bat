@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo ====================================
echo Start deploying XMail to Cloudflare
echo ====================================
echo.

set "PNPM_CMD=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 (
    where corepack >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Neither pnpm nor corepack was found. Please install Node.js 20+ or pnpm ^(>=10^).
        exit /b 1
    )
    set "PNPM_CMD=corepack pnpm"
    echo [INFO] pnpm not found in PATH, using corepack pnpm
)

if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call %PNPM_CMD% install --frozen-lockfile
    if errorlevel 1 (
        echo Dependency installation failed.
        exit /b %errorlevel%
    )
) else (
    echo [1/3] Dependencies exist, skip install
)
echo.

echo [2/3] Deploying Web + Email Worker...
call %PNPM_CMD% run deploy
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
