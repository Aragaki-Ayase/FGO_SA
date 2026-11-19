@echo off
chcp 65001 >nul
title FGO Mooncell 离线图鉴 - 本地服务

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js / npm，请先安装 Node.js。
    pause
    exit /b 1
)

if not exist "app\node_modules" (
    echo [提示] 首次运行，正在安装前端依赖...
    call npm install --prefix app
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络连接。
        pause
        exit /b 1
    )
)

echo ==================================================
echo   正在启动 FGO Mooncell 离线图鉴...
echo   服务就绪后将自动打开默认浏览器
echo   手机同一 Wi-Fi 下也可访问下方显示的 Network 地址
echo   关闭此窗口即可停止本地服务
echo ==================================================
echo.

call npm run dev --prefix app -- --open

if errorlevel 1 (
    echo.
    echo [错误] 服务异常退出。
    pause
)
