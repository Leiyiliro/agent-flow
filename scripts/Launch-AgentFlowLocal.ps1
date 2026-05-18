param(
  [string]$Workspace,
  [int]$WebPort = 37417,
  [int]$TimeoutSeconds = 60,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir '..')
$Url = "http://localhost:$WebPort"
$OutLog = Join-Path $RepoRoot '.agent-flow-local.log'
$ErrLog = Join-Path $RepoRoot '.agent-flow-local.err.log'

if (-not $Workspace) {
  $Workspace = Resolve-Path (Join-Path $RepoRoot '..')
}

function Test-AgentFlowWeb {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Resolve-Pnpm {
  $cmd = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if (-not $cmd) {
    $cmd = Get-Command pnpm -ErrorAction SilentlyContinue
  }
  if (-not $cmd) {
    throw 'pnpm was not found on PATH. Install pnpm or open a shell where pnpm is available.'
  }
  return $cmd.Source
}

if (Test-AgentFlowWeb) {
  Write-Host "Agent Flow is already running at $Url"
} else {
  $pnpm = Resolve-Pnpm

  Remove-Item -LiteralPath $OutLog, $ErrLog -Force -ErrorAction SilentlyContinue

  $args = @('run', 'dev:local', '--', $Workspace)
  $process = Start-Process `
    -FilePath $pnpm `
    -ArgumentList $args `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -WindowStyle Hidden `
    -PassThru

  Write-Host "Starting Agent Flow from $RepoRoot"
  Write-Host "Workspace: $Workspace"
  Write-Host "Process ID: $($process.Id)"
  Write-Host "Logs: $OutLog"

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
      $errorText = if (Test-Path $ErrLog) { Get-Content -Raw $ErrLog } else { '' }
      throw "Agent Flow exited before it was ready. $errorText"
    }
    if (Test-AgentFlowWeb) {
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not (Test-AgentFlowWeb)) {
    throw "Timed out waiting for Agent Flow at $Url. Check $OutLog and $ErrLog."
  }
}

if (-not $NoBrowser) {
  Start-Process $Url
}

Write-Host "Agent Flow: $Url"
