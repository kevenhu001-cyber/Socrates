#requires -Version 5.1
# Resolves site/*.html merge conflicts by keeping origin's Noto SC preconnect/preload
# (a real infra upgrade) and the local cache-busting bumps (20260910) plus the local
# Signal layer HTML additions. Designed to be idempotent: if the conflict markers are
# already gone, it bails out cleanly for that file.

param(
    [string]$Root = "C:\Users\Jiacheng\Desktop\Socrates"
)

$ErrorActionPreference = "Stop"
Set-Location $Root

$files = & git diff --name-only --diff-filter=U
if (-not $files) {
    Write-Host "No conflicted files."
    exit 0
}

$mergedHead = @{
    'en' = @(
        '  <link rel="stylesheet" href="fonts.css?cb=20260816">',
        '  <link rel="preconnect" href="https://fonts.googleapis.com">',
        '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&amp;family=Noto+Serif+SC:wght@400;500;600;700&amp;display=swap" as="style" onload="this.onload=null;this.rel=''stylesheet''">',
        '  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&amp;family=Noto+Serif+SC:wght@400;500;600;700&amp;display=swap"></noscript>',
        '  <link rel="stylesheet" href="editorial.css?cb=20260816">',
        '  <link rel="stylesheet" href="brand.css?cb=20260910">',
        '<script src="locale.js?cb=20260910"></script></head>'
    )
    'zh' = @(
        '  <link rel="stylesheet" href="../fonts.css?cb=20260816">',
        '  <link rel="preconnect" href="https://fonts.googleapis.com">',
        '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&amp;family=Noto+Serif+SC:wght@400;500;600;700&amp;display=swap" as="style" onload="this.onload=null;this.rel=''stylesheet''">',
        '  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&amp;family=Noto+Serif+SC:wght@400;500;600;700&amp;display=swap"></noscript>',
        '  <link rel="stylesheet" href="../editorial.css?cb=20260816">',
        '  <link rel="stylesheet" href="../brand.css?cb=20260910">',
        '<script src="../locale.js?cb=20260910"></script></head>'
    )
}

$conflictPattern = '(?ms)^<<<<<<< HEAD\r?\n.*?^>>>>>>> [0-9a-f]+\r?\n?'
# Match an editorial.js tag whose cb is the old 20260814 (still surviving somewhere
# outside the conflict block — defensive against extra references).
$oldJsPattern = '(?<=<script src=")(?:(?:\.\./)?editorial\.js)\?cb=20260814(?=">)'

$report = @()

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Host "Missing: $file"
        continue
    }
    $content = Get-Content -LiteralPath $file -Raw -Encoding UTF8
    if ($content -notmatch '<<<<<<< HEAD') {
        Write-Host "Skip (no markers): $file"
        continue
    }

    $locale = if ($file -match '(^|/)zh/') { 'zh' } else { 'en' }
    $newBlock = ($mergedHead[$locale] -join "`n")

    $resolved = [regex]::Replace($content, $conflictPattern, $newBlock + "`n", 1)
    if ($resolved -eq $content) {
        Write-Host "Regex did not match: $file"
        $report += [pscustomobject]@{ File = $file; Status = 'NO_MATCH' }
        continue
    }

    # Bump any lingering editorial.js old cb (safety net).
    $resolved = [regex]::Replace($resolved, $oldJsPattern, { param($m) $m.Value.Replace('20260814', '20260910') })

    # Preserve CRLF if the file originally used CRLF.
    $origBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $file))
    $usesCrlf = $false
    for ($i = 0; $i -lt $origBytes.Length - 1; $i++) {
        if ($origBytes[$i] -eq 13 -and $origBytes[$i + 1] -eq 10) { $usesCrlf = $true; break }
    }
    if ($usesCrlf) {
        $resolved = $resolved -replace "`r?`n", "`r`n"
    }

    [System.IO.File]::WriteAllText((Resolve-Path $file), $resolved, [System.Text.UTF8Encoding]::new($false))
    $report += [pscustomobject]@{ File = $file; Status = 'OK'; Locale = $locale; Crlf = $usesCrlf }
}

$report | Format-Table -AutoSize