param(
    [string]$NodeExecutable = "node"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$addonRoot = Join-Path $repositoryRoot "addon"
$buildRoot = Join-Path $repositoryRoot "build"
$stagingRoot = Join-Path $buildRoot "staging"
$outputsRoot = Join-Path $repositoryRoot "outputs"
$requiredPrefix = $repositoryRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

$manifestPath = Join-Path $addonRoot "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "addon/manifest.json is required"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "addon/manifest.json contains an invalid version: $version"
}
$xpiPath = Join-Path $outputsRoot "zotero-context-translator-$version.xpi"

foreach ($path in @($buildRoot, $stagingRoot, $outputsRoot)) {
    $fullPath = [System.IO.Path]::GetFullPath($path)
    if (-not $fullPath.StartsWith($requiredPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to write outside repository: $fullPath"
    }
}

if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Force $stagingRoot, $outputsRoot | Out-Null
Copy-Item -Path (Join-Path $addonRoot "*") -Destination $stagingRoot -Recurse -Force

$bundleScript = Join-Path $repositoryRoot "scripts\build-bundle.mjs"
$bundlePath = Join-Path $stagingRoot "content\plugin-bundle.js"
& $NodeExecutable $bundleScript $bundlePath
if ($LASTEXITCODE -ne 0) {
    throw "Plugin runtime bundling failed with exit code $LASTEXITCODE"
}
Remove-Item -LiteralPath (Join-Path $stagingRoot "content\modules") -Recurse -Force

if (Test-Path -LiteralPath $xpiPath) {
    Remove-Item -LiteralPath $xpiPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
    $xpiPath,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    Get-ChildItem -LiteralPath $stagingRoot -File -Recurse | ForEach-Object {
        $entryName = $_.FullName.Substring($stagingRoot.Length + 1).Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $_.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($xpiPath)
try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    if ($entryNames -match "\\") {
        throw "XPI contains a non-standard backslash entry"
    }
    foreach ($requiredEntry in @("manifest.json", "bootstrap.js")) {
        if ($entryNames -notcontains $requiredEntry) {
            throw "XPI is missing root entry: $requiredEntry"
        }
    }
    $entryNames | Sort-Object
}
finally {
    $archive.Dispose()
}

Write-Output "Built $xpiPath"
