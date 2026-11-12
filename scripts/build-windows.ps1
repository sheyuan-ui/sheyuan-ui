#Requires -Version 5.1
<#
    SHEYUAN-ui Windows 发布包构建脚本。
    在开发机执行：安装依赖、编译前端、组装发布目录并生成 zip。
    服务器端不需要 Node.js，只需要 IIS。

    用法：
      powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
      powershell -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1 -SkipInstall
#>
[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot "release"
$stageDir = Join-Path $releaseRoot "SHEYUAN-ui"
$zipPath = Join-Path $releaseRoot "SHEYUAN-ui-windows.zip"

function Write-Step([string]$Message) {
    Write-Host ("[SHEYUAN-ui] " + $Message) -ForegroundColor Cyan
}

function Invoke-Npm {
    param(
        [string[]]$Arguments,
        [string]$FailureHint = ""
    )
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        $message = "命令执行失败：npm " + ($Arguments -join " ")
        if ($FailureHint) {
            $message = $message + "。" + $FailureHint
        }
        throw $message
    }
}

Push-Location $projectRoot
try {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host "  SHEYUAN-ui Windows 发布包" -ForegroundColor White
    Write-Host "========================================" -ForegroundColor DarkGray
    Write-Host ""

    # 1. 检查环境
    $node = Get-Command node -ErrorAction SilentlyContinue
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($null -eq $node -or $null -eq $npm) {
        throw "未找到 Node.js 或 npm。请先在开发机安装 Node.js 22 LTS（https://nodejs.org/），安装后重新打开命令行窗口再试。"
    }
    $nodeVersion = (& node -v).Trim()
    $majorVersion = [int]($nodeVersion.TrimStart("v").Split(".")[0])
    if ($majorVersion -lt 20) {
        throw ("当前 Node.js 版本为 " + $nodeVersion + "，版本过低。请升级到 Node.js 22 LTS 后重试。")
    }
    Write-Step ("开发环境：Node.js " + $nodeVersion)

    if (-not (Test-Path (Join-Path $projectRoot "package.json"))) {
        throw "当前目录不是 SHEYUAN-ui 项目目录，未找到 package.json。"
    }

    # 2. 安装依赖
    if (-not $SkipInstall) {
        Write-Step "安装前端依赖（首次需要下载，约 1-3 分钟）..."
        if (Test-Path (Join-Path $projectRoot "package-lock.json")) {
            Invoke-Npm @("ci", "--no-audit", "--no-fund") -FailureHint "如果正在运行开发服务器（npm run dev），请先关闭后再打包；也请确认没有杀毒软件或其他程序占用 node_modules。"
        } else {
            Invoke-Npm @("install", "--no-audit", "--no-fund") -FailureHint "如果正在运行开发服务器（npm run dev），请先关闭后再打包；也请确认没有杀毒软件或其他程序占用 node_modules。"
        }
    } else {
        Write-Step "已跳过依赖安装（-SkipInstall）。"
    }

    # 3. 编译
    Write-Step "编译前端..."
    Invoke-Npm @("run", "build")
    $distDir = Join-Path $projectRoot "dist"
    if (-not (Test-Path (Join-Path $distDir "index.html"))) {
        throw "编译完成但未找到 dist\index.html，请检查编译日志。"
    }

    # 4. 组装发布目录
    Write-Step "组装发布目录..."
    if (Test-Path $stageDir) {
        Remove-Item $stageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $stageDir -Force | Out-Null
    Copy-Item -Path (Join-Path $distDir "*") -Destination $stageDir -Recurse -Force

    $webConfig = Join-Path $projectRoot "deploy\windows\web.config"
    if (-not (Test-Path $webConfig)) {
        throw "缺少 IIS 配置文件 deploy\windows\web.config。"
    }
    Copy-Item $webConfig (Join-Path $stageDir "web.config") -Force

    $installer = Join-Path $projectRoot "deploy\windows\install-iis-site.ps1"
    Copy-Item $installer (Join-Path $releaseRoot "install-iis-site.ps1") -Force

    $deployDoc = Join-Path $projectRoot "DEPLOY.md"
    if (Test-Path $deployDoc) {
        Copy-Item $deployDoc (Join-Path $releaseRoot "部署说明.md") -Force
    }

    $manual = Join-Path $projectRoot "SHEYUAN-ui 运行操作手册.docx"
    if (Test-Path $manual) {
        Copy-Item $manual (Join-Path $releaseRoot "SHEYUAN-ui 运行操作手册.docx") -Force
    }

    # 5. 生成 zip
    Write-Step "生成压缩包..."
    $zipItems = @($stageDir, (Join-Path $releaseRoot "install-iis-site.ps1"))
    if (Test-Path $deployDoc) {
        $zipItems += (Join-Path $releaseRoot "部署说明.md")
    }
    if (Test-Path $manual) {
        $zipItems += (Join-Path $releaseRoot "SHEYUAN-ui 运行操作手册.docx")
    }
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }
    Compress-Archive -Path $zipItems -DestinationPath $zipPath -CompressionLevel Optimal

    # 6. 汇总
    $files = @(Get-ChildItem $stageDir -Recurse -File)
    $size = [math]::Round((($files | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
    $zipSize = [math]::Round(((Get-Item $zipPath).Length / 1MB), 1)

    Write-Host ""
    Write-Host "打包完成。" -ForegroundColor Green
    Write-Host ("  站点目录：" + $stageDir + "（" + $files.Count + " 个文件，" + $size + " MB）")
    Write-Host ("  发布压缩包：" + $zipPath + "（" + $zipSize + " MB）")
    Write-Host ""
    Write-Host "下一步：把 zip 或 SHEYUAN-ui 文件夹拷贝到 Windows 服务器，按《部署说明.md》安装 IIS 并创建站点。" -ForegroundColor DarkGray
    Write-Host ""
} finally {
    Pop-Location
}
