#Requires -Version 5.1
<#
.SYNOPSIS
  One-shot local dev environment for Solitaire Collection:
    1. Starts Docker Desktop (if not running)
    2. Rebuilds the Nakama match module (server/build/index.js)
    3. Brings up Postgres + Nakama (docker-compose.nakama.yml)
    4. Waits for Nakama's HTTP API, then launches the Vite dev server

.USAGE
  .\start-all.ps1            # full stack: Nakama + Vite dev
  .\start-all.ps1 -NoServer  # solo dev only: skip Docker/Nakama entirely
#>
param(
  [switch]$NoServer
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

if (-not $NoServer) {
  # --- 1. Docker Desktop ---------------------------------------------------
  Write-Step 'Checking Docker'
  $dockerUp = $false
  try {
    docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    $dockerUp = ($LASTEXITCODE -eq 0)
  } catch { $dockerUp = $false }

  if (-not $dockerUp) {
    $dockerExe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
      Write-Host '    Starting Docker Desktop…'
      Start-Process $dockerExe | Out-Null
      $deadline = (Get-Date).AddMinutes(3)
      do {
        Start-Sleep -Seconds 3
        try {
          docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
          $dockerUp = ($LASTEXITCODE -eq 0)
        } catch { $dockerUp = $false }
      } until ($dockerUp -or (Get-Date) -gt $deadline)
    }
    if (-not $dockerUp) {
      Write-Host '    Docker unavailable — falling back to solo dev (no race mode).' -ForegroundColor Yellow
      $NoServer = $true
    }
  } else {
    Write-Host '    Docker is running.'
  }
}

if (-not $NoServer) {
  # --- 2. Nakama match module ---------------------------------------------
  Write-Step 'Building server module (server/build/index.js)'
  Push-Location $root
  try { npm run build:server } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw 'build:server failed' }

  # --- 3. Postgres + Nakama ------------------------------------------------
  Write-Step 'Starting Nakama + Postgres'
  docker compose -f "$root\docker-compose.nakama.yml" up -d
  if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

  # --- 4. Wait for Nakama HTTP API ----------------------------------------
  Write-Step 'Waiting for Nakama (localhost:7350)'
  $ready = $false
  $deadline = (Get-Date).AddSeconds(90)
  do {
    try {
      Invoke-WebRequest -Uri 'http://localhost:7350/' -UseBasicParsing -TimeoutSec 3 | Out-Null
      $ready = $true
    } catch {
      # Nakama answers / with 404 once up — any HTTP response means ready.
      if ($_.Exception.Response) { $ready = $true } else { Start-Sleep -Seconds 2 }
    }
  } until ($ready -or (Get-Date) -gt $deadline)

  if (-not $ready) {
    Write-Host '    Nakama did not come up in 90s — check `docker compose -f docker-compose.nakama.yml logs`.' -ForegroundColor Red
    exit 1
  }
  Write-Host '    Nakama is up. Console: http://localhost:7351 (admin / password)' -ForegroundColor Green
}

# --- 5. Vite dev server ----------------------------------------------------
Write-Step 'Starting Vite dev server'
Push-Location $root
try { npm run dev } finally { Pop-Location }
