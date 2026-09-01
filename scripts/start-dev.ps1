$ErrorActionPreference = 'Stop'

$port = 5173
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$repoRootPattern = [regex]::Escape($repoRoot.TrimEnd('\'))

Write-Host '[Accordbook Dev Server]'
Write-Host "Checking port $port..."

$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
$processIds = @($listeners | ForEach-Object { $_.OwningProcess })
if ($processIds.Count -eq 0) {
  $processIds = @(netstat -ano | Select-String ":$port\s+.*LISTENING\s+\d+$" | ForEach-Object {
    $columns = $_.Line.Trim() -split '\s+'
    if ($columns.Count -gt 0) { [int]$columns[-1] }
  } | Where-Object { $_ -gt 0 } | Select-Object -Unique)
}

function Get-CommandLineForProcess([int]$processId) {
  try {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
    return [string]$processInfo.CommandLine
  } catch {
    throw "Cannot safely inspect PID $processId. The process was not terminated. Run this command from an elevated PowerShell if needed."
  }
}

$staleIds = @()
foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -eq $process) { continue }
  $commandLine = Get-CommandLineForProcess $processId
  $isNode = $process.ProcessName -in @('node', 'nodejs')
  $isVite = $commandLine -match '(?i)(vite|node_modules[\\/]\.bin[\\/]vite)'
  $isAccordbook = $commandLine -match $repoRootPattern

  if ($isNode -and $isVite -and $isAccordbook) {
    Write-Host "Found stale Accordbook dev server: PID $processId"
    $staleIds += $processId
  } else {
    Write-Host 'Port 5173 is already being used by another process.'
    Write-Host "PID: $processId"
    Write-Host "Process: $($process.ProcessName)"
    Write-Host 'The process was not terminated.'
    exit 1
  }
}

if ($staleIds.Count -gt 0) {
  Write-Host 'Stopping stale Accordbook dev servers...'
  $staleIds | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
  $released = $false
  for ($attempt = 0; $attempt -lt 6; $attempt++) {
    Start-Sleep -Milliseconds 200
    $stillListening = @(netstat -ano | Select-String ":$port\s+.*LISTENING\s+\d+$")
    if ($stillListening.Count -eq 0) { $released = $true; break }
  }
  if (-not $released) { throw "Port $port was not released after stopping stale Accordbook servers." }
  Write-Host "Port $port is now free."
} else {
  Write-Host "Port $port is free."
}

Write-Host 'Starting Accordbook...'
Push-Location $repoRoot
try {
  & npm.cmd run dev
} finally {
  Pop-Location
}
