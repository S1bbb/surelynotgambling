$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$sngNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $sngNode) {
    $sngPortable = Join-Path $env:TEMP 'sng-runtime/node-v22.16.0-win-x64'
    if (-not (Test-Path -LiteralPath (Join-Path $sngPortable 'node.exe'))) {
        throw 'Install Node.js 22.16+ and run this script again.'
    }
    $env:Path = $sngPortable + ';' + $env:Path
}
if (-not (Test-Path -LiteralPath 'web/node_modules')) {
    npm.cmd run setup
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
}
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
npm.cmd start
