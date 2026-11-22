$proj = $PSScriptRoot
$url = 'http://localhost:5174/'
$logDir = Join-Path $env:LOCALAPPDATA 'sheyuan-ui'

function Test-Up {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $client.Connect('127.0.0.1', 5174)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

if (-not (Test-Up)) {
  $null = New-Item -ItemType Directory -Force -Path $logDir
  Start-Process -FilePath 'node' `
    -ArgumentList 'node_modules/vite/bin/vite.js' `
    -WorkingDirectory $proj `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'vite.log') `
    -RedirectStandardError (Join-Path $logDir 'vite.err.log')

  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline -and -not (Test-Up)) {
    Start-Sleep -Milliseconds 600
  }
}

if (-not (Test-Up)) {
  $ws = New-Object -ComObject WScript.Shell
  $null = $ws.Popup('开发服务器启动失败，请查看 ' + $logDir + '\vite.err.log', 8, '打开网页', 48)
  exit
}

Start-Process $url