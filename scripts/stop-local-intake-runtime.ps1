# TEMP: 停止本地 SOP + Collator 运行时 | 2026-08-03 | 2026-08-06
# FAMP-PORTAL-VERCEL-LOCAL-RUNTIME-01: 本地停止脚本

param(
  [string]$LogDir = "$env:TEMP\famp-local-runtime"
)

$pidFile = Join-Path $LogDir "runtime-pids.json"

Write-Host "=== 停止 FAMP 本地运行时 ===" -ForegroundColor Cyan

if (-not (Test-Path $pidFile)) {
  Write-Host "PID 文件不存在: $pidFile" -ForegroundColor Yellow
  Write-Host "尝试按端口查找进程..." -ForegroundColor Gray

  # 按端口查找并停止
  foreach ($port in @(3001, 8787)) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
      $procId = $conn.OwningProcess | Select-Object -Unique
      foreach ($id in $procId) {
        Write-Host "  停止端口 $port 的进程 (PID: $id)..."
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
      }
    }
  }
} else {
  $pidData = Get-Content $pidFile | ConvertFrom-Json

  # 停止 SOP
  if ($pidData.sop) {
    Write-Host "  停止 SOP (PID: $($pidData.sop))..."
    Stop-Process -Id $pidData.sop -Force -ErrorAction SilentlyContinue
  }

  # 停止 Collator
  if ($pidData.collator) {
    Write-Host "  停止 Collator (PID: $($pidData.collator))..."
    Stop-Process -Id $pidData.collator -Force -ErrorAction SilentlyContinue
  }

  # 清理 PID 文件
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 额外清理：按端口查找残留进程
foreach ($port in @(3001, 8787)) {
  $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if ($conn) {
    $procId = $conn.OwningProcess | Select-Object -Unique
    foreach ($id in $procId) {
      Write-Host "  清理端口 $port 残留进程 (PID: $id)..."
      Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "`n=== 本地运行时已停止 ===" -ForegroundColor Green
