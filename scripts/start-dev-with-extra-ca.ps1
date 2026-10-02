$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$certificateBundle = Join-Path $projectRoot '.data\certificates\capgemini-node-trust.pem'

if (-not (Test-Path $certificateBundle)) {
  throw "Certificato CA locale non trovato: $certificateBundle"
}

$env:NODE_EXTRA_CA_CERTS = $certificateBundle
Push-Location $projectRoot

try {
  & npm.cmd run dev:all
  exit $LASTEXITCODE
} finally {
  Pop-Location
}