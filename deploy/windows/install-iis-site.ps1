#Requires -Version 5.1
<#
    在 IIS 中创建或更新 SHEYUAN-ui 静态站点。
    需要以管理员身份运行，且已安装 IIS（含 IIS 管理脚本和工具）。

    用法：
      powershell -ExecutionPolicy Bypass -File .\install-iis-site.ps1
      powershell -ExecutionPolicy Bypass -File .\install-iis-site.ps1 -SitePath "C:\inetpub\sheyuan-ui" -Port 8080
#>
[CmdletBinding()]
param(
    [string]$SitePath = "C:\inetpub\sheyuan-ui",
    [int]$Port = 8080,
    [string]$SiteName = "sheyuan-ui",
    [string]$AppPoolName = "sheyuan-ui",
    [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ("[SHEYUAN-ui] " + $Message) -ForegroundColor Cyan
}

# 1. 管理员权限
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "请以管理员身份打开 PowerShell 后再运行本脚本。"
}

# 2. 检查 IIS 与站点文件
$appcmd = Join-Path $env:windir "System32\inetsrv\appcmd.exe"
if (-not (Test-Path $appcmd)) {
    throw '本机未安装 IIS。请先在“启用或关闭 Windows 功能”中安装 Internet Information Services，再重新运行。'
}

$SitePath = [System.IO.Path]::GetFullPath($SitePath)
if (-not (Test-Path $SitePath)) {
    throw ("站点目录不存在：" + $SitePath + "。请先解压发布包，把 index.html 所在目录作为站点目录。")
}
if (-not (Test-Path (Join-Path $SitePath "index.html"))) {
    throw ("站点目录中没有 index.html：" + $SitePath + "。请确认解压后目录层级，不要把整个发布包文件夹当站点目录。")
}
if (-not (Test-Path (Join-Path $SitePath "web.config"))) {
    Write-Warning "站点目录中缺少 web.config，MIME 映射与缓存策略不会生效。请从发布包中一并拷贝。"
}

try {
    Import-Module WebAdministration -ErrorAction Stop
} catch {
    throw '无法加载 IIS 管理模块。请在“启用或关闭 Windows 功能”中勾选“IIS 管理脚本和工具”，或按《部署说明.md》第四节第 3 步手动创建站点。'
}
Start-Service W3SVC -ErrorAction SilentlyContinue

# 3. 应用程序池（无托管代码）
if (-not (Test-Path ("IIS:\AppPools\" + $AppPoolName))) {
    New-WebAppPool -Name $AppPoolName | Out-Null
    Write-Step ("已创建应用程序池：" + $AppPoolName)
} else {
    Write-Step ("应用程序池已存在：" + $AppPoolName)
}
Set-ItemProperty ("IIS:\AppPools\" + $AppPoolName) -Name managedRuntimeVersion -Value ""
Set-ItemProperty ("IIS:\AppPools\" + $AppPoolName) -Name enable32BitAppOnWin64 -Value $false

# 4. 站点与端口绑定
$site = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($null -ne $site) {
    Set-ItemProperty ("IIS:\Sites\" + $SiteName) -Name physicalPath -Value $SitePath
    Set-ItemProperty ("IIS:\Sites\" + $SiteName) -Name applicationPool -Value $AppPoolName
    $pattern = "*:" + $Port + ":*"
    $hasBinding = @($site.Bindings.Collection | Where-Object { $_.bindingInformation -like $pattern }).Count -gt 0
    if (-not $hasBinding) {
        New-WebBinding -Name $SiteName -Protocol http -Port $Port -IPAddress "*" | Out-Null
    }
    Write-Step ("已更新站点：" + $SiteName + " -> " + $SitePath)
} else {
    New-Website -Name $SiteName -PhysicalPath $SitePath -Port $Port -ApplicationPool $AppPoolName | Out-Null
    Write-Step ("已创建站点：" + $SiteName + " -> " + $SitePath)
}

# 5. 目录读取权限
& icacls.exe $SitePath /grant "IIS_IUSRS:(OI)(CI)(RX)" /T /C /Q | Out-Null
$poolIdentity = $env:COMPUTERNAME + "\IIS AppPool\" + $AppPoolName
& icacls.exe $SitePath /grant ($poolIdentity + ":(OI)(CI)(RX)") /T /C /Q | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "目录权限授予失败，如出现 401/403，请在站点目录安全属性中为 IIS_IUSRS 添加读取权限。"
}

# 6. 防火墙放行
if (-not $SkipFirewall) {
    $ruleName = "SHEYUAN-ui (TCP " + $Port + ")"
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
        Write-Step ("已放行防火墙端口：" + $Port)
    }
}

# 7. 启动站点
Start-Website -Name $SiteName | Out-Null

Write-Step "部署完成。"
Write-Host ""
Write-Host ("  站点地址：http://localhost:" + $Port + "/") -ForegroundColor Green
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress)
foreach ($ip in $ips) {
    Write-Host ("  局域网地址：http://" + $ip + ":" + $Port + "/") -ForegroundColor Green
}
Write-Host ""
Write-Host "提示：其他电脑打不开时，请检查 Windows 防火墙与服务器安全组是否放行该端口。" -ForegroundColor DarkGray
