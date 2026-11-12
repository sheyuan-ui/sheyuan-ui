#Requires -Version 5.1
<#
    SHEYUAN-ui Windows 开发服务器启动脚本。
    检查 Node.js、首次安装依赖，然后执行 npm run dev。

    用法：
      双击项目根目录的 dev-windows.bat
#>

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$node = Get-Command node -ErrorAction SilentlyContinue
$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($null -eq $node -or $null -eq $npm) {
    Write-Host "[SHEYUAN-ui] 未检测到 Node.js。" -ForegroundColor Yellow
    Write-Host "请先安装 Node.js 22 LTS：https://nodejs.org/，安装后重新双击 dev-windows.bat。"
    exit 1
}

$nodeVersion = (& node -v).Trim()
Write-Host ("[SHEYUAN-ui] Node.js " + $nodeVersion) -ForegroundColor DarkGray

if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
    Write-Host "[SHEYUAN-ui] 首次运行，正在安装依赖..." -ForegroundColor Cyan
    if (Test-Path (Join-Path $projectRoot "package-lock.json")) {
        & npm ci --no-audit --no-fund
    } else {
        & npm install --no-audit --no-fund
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[SHEYUAN-ui] 依赖安装失败。可先执行：" -ForegroundColor Red
        Write-Host "  npm config set registry https://registry.npmmirror.com"
        Write-Host "然后重新双击 dev-windows.bat。"
        exit 1
    }
}

Write-Host "[SHEYUAN-ui] 启动开发服务器，关闭本窗口或按 Ctrl+C 停止。" -ForegroundColor Cyan
& npm run dev
