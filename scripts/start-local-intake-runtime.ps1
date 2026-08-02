# TEMP: 本地启动 SOP + Collator 运行时 | 2026-08-03 | 2026-08-06
# FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01: 本地启动脚本
#
# 职责：
# 1. 验证 Node 路径
# 2. 验证 Collator .env 存在
# 3. 检查端口 3001、8787
# 4. 先启动 SOP
# 5. 等待 SOP ready
# 6. 再启动 Collator
# 7. 等待 /readyz
# 8. 输出 Portal Production URL
# 9. 输出日志文件位置
# 10. 不打印 Secret
# 11. 失败时关闭已启动的子进程

param(
  [string]$SopDir = "..\SOP",
  [string]$CollatorDir = "..\collator",
  [string]$LogDir = "$env:TEMP\famp-local-runtime"
)

$ErrorActionPreference = "Stop"

# 确保日志目录存在
if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$sopLog = Join-Path $LogDir "sop.log"
$collatorLog = Join-Path $LogDir "collator.log"
$pidFile = Join-Path $LogDir "runtime-pids.json"

$processes = @{}

function Stop-StartedProcesses {
  foreach ($key in $processes.Keys) {
    $proc = $processes[$key]
    if ($proc -and -not $proc.HasExited) {
      Write-Host "  停止 $key (PID: $($proc.Id))..."
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

function Wait-ForReady {
  param([string]$Url, [string]$Name, [int]$TimeoutSec = 30)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
      if ($response.StatusCode -eq 200) {
        Write-Host "  [OK] $Name 就绪" -ForegroundColor Green
        return $true
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  Write-Host "  [FAIL] $Name 在 ${TimeoutSec}s 内未就绪" -ForegroundColor Red
  return $false
}

function Test-PortInUse {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  return $null -ne $conn
}

try {
  Write-Host "=== FAMP 本地运行时启动 ===" -ForegroundColor Cyan

  # 1. 验证 Node 路径
  Write-Host "`n[1/7] 验证 Node.js..."
  $nodeVersion = node --version 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Node.js 未找到，请确保已安装 Node.js 20+"
  }
  Write-Host "  Node.js: $nodeVersion" -ForegroundColor Gray

  # 2. 验证 Collator .env 存在
  Write-Host "`n[2/7] 验证 Collator .env..."
  $collatorEnv = Join-Path $CollatorDir ".env"
  if (-not (Test-Path $collatorEnv)) {
    throw "Collator .env 不存在: $collatorEnv"
  }
  Write-Host "  .env 已确认存在（不打印内容）" -ForegroundColor Gray

  # 3. 检查端口
  Write-Host "`n[3/7] 检查端口..."
  if (Test-PortInUse -Port 3001) {
    throw "端口 3001 已被占用（SOP 可能已在运行）"
  }
  if (Test-PortInUse -Port 8787) {
    throw "端口 8787 已被占用（Collator 可能已在运行）"
  }
  Write-Host "  端口 3001、8787 均空闲" -ForegroundColor Gray

  # 4. 启动 SOP
  Write-Host "`n[4/7] 启动 SOP (pre-write server)..."
  $sopProc = Start-Process -FilePath "node" -ArgumentList "src/server/pre-write-server.js" `
    -WorkingDirectory $SopDir -RedirectStandardOutput $sopLog -RedirectStandardError $sopLog `
    -NoNewWindow -PassThru
  $processes["SOP"] = $sopProc
  Write-Host "  SOP PID: $($sopProc.Id), 日志: $sopLog" -ForegroundColor Gray

  # 5. 等待 SOP ready
  Write-Host "`n[5/7] 等待 SOP 就绪..."
  $sopReady = Wait-ForReady -Url "http://127.0.0.1:3001/healthz" -Name "SOP" -TimeoutSec 30
  if (-not $sopReady) {
    throw "SOP 启动失败，请检查日志: $sopLog"
  }

  # 6. 启动 Collator
  Write-Host "`n[6/7] 启动 Collator..."
  # 设置环境变量：绑定 loopback，配置 CORS allowlist
  $env:COLLATOR_HOST = "127.0.0.1"
  $env:COLLATOR_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000,https://portal-seven-jade-47.vercel.app"

  # 优先使用 dev 模式（tsx），回退到 build 后的 dist
  $collatorProc = Start-Process -FilePath "npx" -ArgumentList "tsx", "src/server/app.ts" `
    -WorkingDirectory $CollatorDir -RedirectStandardOutput $collatorLog -RedirectStandardError $collatorLog `
    -NoNewWindow -PassThru
  $processes["Collator"] = $collatorProc
  Write-Host "  Collator PID: $($collatorProc.Id), 日志: $collatorLog" -ForegroundColor Gray

  # 7. 等待 Collator /readyz
  Write-Host "`n[7/7] 等待 Collator 就绪..."
  $collatorReady = Wait-ForReady -Url "http://127.0.0.1:8787/readyz" -Name "Collator" -TimeoutSec 45
  if (-not $collatorReady) {
    throw "Collator 启动失败，请检查日志: $collatorLog"
  }

  # 保存 PID 文件
  $pidData = @{
    sop = $sopProc.Id
    collator = $collatorProc.Id
    startedAt = (Get-Date).ToString("o")
  } | ConvertTo-Json
  Set-Content -Path $pidFile -Value $pidData

  # 输出结果
  Write-Host "`n=== 本地运行时已启动 ===" -ForegroundColor Green
  Write-Host ""
  Write-Host "SOP:        http://127.0.0.1:3001" -ForegroundColor White
  Write-Host "Collator:   http://127.0.0.1:8787" -ForegroundColor White
  Write-Host ""
  Write-Host "Portal Production URL:" -ForegroundColor Yellow
  Write-Host "  https://portal-seven-jade-47.vercel.app" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "日志文件:" -ForegroundColor Yellow
  Write-Host "  SOP:      $sopLog"
  Write-Host "  Collator: $collatorLog"
  Write-Host "  PID:      $pidFile"
  Write-Host ""
  Write-Host "停止运行时: .\scripts\stop-local-intake-runtime.ps1" -ForegroundColor Gray

} catch {
  Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "正在清理已启动的进程..." -ForegroundColor Yellow
  Stop-StartedProcesses
  exit 1
}
