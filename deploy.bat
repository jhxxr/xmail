@echo off
echo ====================================
echo 开始部署 XMail 到 Cloudflare
echo ====================================
echo.

echo [1/2] 构建项目...
cd apps\web
call pnpm build
if %errorlevel% neq 0 (
    echo 构建失败！
    pause
    exit /b %errorlevel%
)
echo 构建成功！
echo.

echo [2/2] 部署到 Cloudflare Pages...
call wrangler pages deploy dist --project-name=xmail
if %errorlevel% neq 0 (
    echo 部署失败！
    pause
    exit /b %errorlevel%
)

echo.
echo ====================================
echo 部署完成！
echo ====================================
pause
