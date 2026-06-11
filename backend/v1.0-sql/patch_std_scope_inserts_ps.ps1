$ErrorActionPreference = 'Stop'
$p = Join-Path $PSScriptRoot 'std_scope_inserts_only.sql'
if (-not (Test-Path -LiteralPath $p)) {
    Write-Error "File not found: $p"
    exit 1
}

$tmp = $p + '.tmp'
$hdr = @"
SET NAMES utf8mb4;
SET SESSION FOREIGN_KEY_CHECKS=0;
SET SESSION UNIQUE_CHECKS=0;

"@
$ftr = @"

SET SESSION FOREIGN_KEY_CHECKS=1;
SET SESSION UNIQUE_CHECKS=1;
"@

$reader = [System.IO.StreamReader]::new($p)
$writer = [System.IO.StreamWriter]::new($tmp, $false, [System.Text.UTF8Encoding]::new($false))
try {
    $writer.Write($hdr)
    while ($null -ne ($line = $reader.ReadLine())) {
        $writer.WriteLine($line)
    }
    $writer.Write($ftr)
}
finally {
    $reader.Close()
    $writer.Close()
}

Remove-Item -LiteralPath $p -Force
Move-Item -LiteralPath $tmp -Destination $p
Write-Host "OK: wrapped $p"
