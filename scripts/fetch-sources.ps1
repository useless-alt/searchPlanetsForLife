<#
.SYNOPSIS
    Скачивает актуальные JSON-снимки всех источников экзопланетных данных.

.DESCRIPTION
    Источники: NASA Exoplanet Archive, Exoplanet.eu, Exo-MerCat, Gaia DR3,
    SIMBAD, Exo.MAST (per-planet).

    Для каждого источника сохраняется:
      data/backups/<source>/latest.json          - последний успешный ответ
      data/backups/<source>/<YYYYMMDD_HHMMSS>.json - версия для отката
      data/backups/manifest.json                 - сводка по всем источникам

    TAP-источники отдают строки массивами, поэтому дополнительно создаётся
    latest.objects.json - те же данные с именованными полями.

.PARAMETER OutDir
    Каталог для резервных копий. По умолчанию <repo>\data\backups.

.PARAMETER Sources
    Подмножество источников: nasa, exoplanet_eu, exomercat, gaia, simbad, exomast.

.PARAMETER SkipNormalize
    Не создавать latest.objects.json для TAP-источников.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\fetch-sources.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\fetch-sources.ps1 -Sources nasa,gaia
#>
[CmdletBinding()]
param(
    [string]$OutDir,
    [string[]]$Sources = @('nasa', 'exoplanet_eu', 'exomercat', 'gaia', 'simbad', 'exomast'),
    [string[]]$ExoMastPlanets = @(
        'Proxima Centauri b', 'TRAPPIST-1 e', 'Kepler-452 b', 'TOI-700 d', 'WASP-39 b',
        '55 Cnc e', 'GJ 1214 b', 'K2-18 b', 'HD 209458 b', 'Kepler-186 f'
    ),
    [switch]$SkipNormalize
)

$ErrorActionPreference = 'Continue'

# powershell -File передаёт "nasa,gaia" одной строкой: нормализуем в массив.
$Sources = @($Sources | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

if (-not $OutDir) {
    $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\backups'
}
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    throw 'curl.exe не найден. Он входит в Windows 10/11 по умолчанию.'
}

# ---------------------------------------------------------------- config ----
$tapSources = [ordered]@{
    nasa = @{
        Base    = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'
        Timeout = 180
        Shape   = 'objects'
        Note    = 'NASA Exoplanet Archive, pscomppars (all confirmed planets)'
        Query   = @'
select pl_name,hostname,disc_year,discoverymethod,pl_orbper,pl_orbsmax,pl_orbeccen,
pl_rade,pl_bmasse,pl_dens,pl_eqt,pl_insol,sy_snum,sy_pnum,st_spectype,st_teff,
st_rad,st_mass,st_lum,st_met,sy_dist,ra,dec from pscomppars
'@ -replace '\s+', ' '
    }
    exoplanet_eu = @{
        Base    = 'http://voparis-tap-planeto.obspm.fr/tap/sync'
        Timeout = 180
        Shape   = 'tap-columns'
        Note    = 'Exoplanet.eu, exoplanet.epn_core (full catalogue)'
        Query   = @'
select target_name,alt_target_name,star_name,radius,mass,period,semi_major_axis,
eccentricity,temp_calculated,temp_measured,star_teff,star_radius,star_mass,
star_metallicity,star_distance,star_spec_type,ra,dec,discovered,updated,
detection_type,mass_detection_type,radius_detection_type from exoplanet.epn_core
'@ -replace '\s+', ' '
    }
    exomercat = @{
        Base    = 'http://archives.ia2.inaf.it/vo/tap/projects/sync'
        Timeout = 900
        Shape   = 'tap-metadata'
        Note    = 'Exo-MerCat, exomercat.exomercat (merged catalogue)'
        Query   = @'
select exomercat_name,nasa_name,toi_name,eu_name,host,main_id,main_id_ra,
main_id_dec,mass,mass_min,mass_max,msini,msini_min,msini_max,bestmass,
bestmass_min,bestmass_max,bestmass_provenance,bestmass_url,p,p_min,p_max,r,
r_min,r_max,a,a_min,a_max,e,e_min,e_max,i,discovery_method,status,confirmed,
discovery_year,main_id_aliases from exomercat.exomercat
'@ -replace '\s+', ' '
    }
    gaia = @{
        Base    = 'https://gea.esac.esa.int/tap-server/tap/sync'
        Timeout = 300
        Shape   = 'tap-metadata'
        Note    = 'Gaia DR3 sample 2000 rows (quality filter) + astrophysical_parameters'
        Query   = @'
select top 2000 g.source_id,g.ra,g.dec,g.parallax,g.parallax_error,g.pmra,
g.pmdec,g.phot_g_mean_mag,g.bp_rp,g.ruwe,a.teff_gspphot,a.radius_gspphot,
a.mass_flame from gaiadr3.gaia_source as g
join gaiadr3.astrophysical_parameters as a on g.source_id = a.source_id
where g.parallax > 0 and g.ruwe < 1.4
'@ -replace '\s+', ' '
    }
    simbad = @{
        Base    = 'https://simbad.cfa.harvard.edu/simbad/sim-tap/sync'
        Timeout = 180
        Shape   = 'tap-metadata'
        Note    = 'SIMBAD sample 5000 objects (Harvard mirror)'
        Query   = @'
select top 5000 main_id,ra,dec,otype_txt,sp_type,plx_value,pmra,pmdec
from basic where ra is not null
'@ -replace '\s+', ' '
    }
}

# --------------------------------------------------------------- helpers ----
function Invoke-JsonRequest {
    param([string]$Url, [hashtable]$Query, [int]$TimeoutSec = 180)

    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("fetch-" + [guid]::NewGuid().ToString('N') + '.json')
    $cli = @('-sS', '-L', '-m', "$TimeoutSec", '-G', '-o', $tmp, '-w', '%{http_code}|%{size_download}')
    foreach ($k in $Query.Keys) {
        $cli += '--data-urlencode'
        $cli += ('{0}={1}' -f $k, $Query[$k])
    }
    $cli += $Url

    $out = (& curl.exe @cli 2>&1 | Out-String).Trim()
    $code = '000'
    $bytes = 0
    $parts = $out -split '\|'
    if ($parts.Count -ge 2) {
        $code = $parts[0]
        [void][int]::TryParse($parts[1], [ref]$bytes)
    }
    else {
        $code = $out
    }

    $text = ''
    if (Test-Path $tmp) {
        $text = [System.IO.File]::ReadAllText($tmp)
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }

    $res = [pscustomobject]@{
        Http = $code; Bytes = $bytes; Text = $text
        Valid = $false; Records = 0; Error = ''; Data = $null
    }

    if ([string]::IsNullOrWhiteSpace($text)) { $res.Error = 'empty response'; return $res }
    if ($text.TrimStart().StartsWith('<')) { $res.Error = 'non-JSON response (VOTable/XML error)'; return $res }

    try {
        $obj = $text | ConvertFrom-Json
        if ($obj -is [array]) { $res.Records = @($obj).Count }
        elseif ($obj.PSObject.Properties['data']) { $res.Records = @($obj.data).Count }
        else { $res.Records = 1 }
        $res.Data = $obj
        $res.Valid = $true
    }
    catch {
        $res.Error = $_.Exception.Message
    }
    return $res
}

function Get-SourceDir {
    param([string]$Name)
    $dir = Join-Path $OutDir $Name
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

function Save-Snapshot {
    param([string]$Dir, [string]$Latest)
    $snap = Join-Path $Dir ("{0}.json" -f $stamp)
    Copy-Item $Latest $snap -Force
}

function Save-TapSource {
    param([string]$Name, [hashtable]$Cfg)

    $dir = Get-SourceDir $Name
    $latest = Join-Path $dir 'latest.json'
    $query = @{ REQUEST = 'doQuery'; LANG = 'ADQL'; FORMAT = 'json'; QUERY = $Cfg.Query }

    $r = Invoke-JsonRequest -Url $Cfg.Base -Query $query -TimeoutSec $Cfg.Timeout

    if ($r.Valid) {
        [System.IO.File]::WriteAllText($latest, $r.Text, $utf8)
        Save-Snapshot -Dir $dir -Latest $latest
    }

    return [pscustomobject]@{
        source = $Name; http = $r.Http; bytes = $r.Bytes; records = $r.Records
        json_valid = $r.Valid; shape = $Cfg.Shape; note = $Cfg.Note; error = $r.Error
    }
}

function Convert-TapToObjects {
    param([string]$Name)

    $dir = Join-Path $OutDir $Name
    $raw = Join-Path $dir 'latest.json'
    if (-not (Test-Path $raw)) { return $null }

    $obj = [System.IO.File]::ReadAllText($raw) | ConvertFrom-Json
    if (-not $obj.PSObject.Properties['data']) { return $null }

    $meta = if ($obj.PSObject.Properties['metadata']) { @($obj.metadata) }
            elseif ($obj.PSObject.Properties['columns']) { @($obj.columns) }
            else { @() }
    $cols = @($meta | ForEach-Object { $_.name })

    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($row in $obj.data) {
        if ($null -eq $row) { continue }
        $vals = @($row)
        $h = [ordered]@{}
        for ($i = 0; $i -lt $cols.Count; $i++) {
            $h[$cols[$i]] = if ($i -lt $vals.Count) { $vals[$i] } else { $null }
        }
        $rows.Add([pscustomobject]$h)
    }

    $dst = Join-Path $dir 'latest.objects.json'
    $json = $rows | ConvertTo-Json -Depth 5 -Compress
    [System.IO.File]::WriteAllText($dst, $json, $utf8)
    return [pscustomobject]@{ rows = $rows.Count; columns = $cols.Count; file = $dst }
}

function Save-ExoMast {
    param([string[]]$Planets)

    $dir = Get-SourceDir 'exomast'
    $index = @()
    $combined = @()

    foreach ($p in $Planets) {
        $enc = $p -replace ' ', '%20'
        $slug = ($p -replace '[^A-Za-z0-9]+', '_').Trim('_').ToLower()
        $file = Join-Path $dir ("{0}.json" -f $slug)
        $url = "https://exo.mast.stsci.edu/api/v0.1/exoplanets/$enc/properties/"

        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("mast-" + [guid]::NewGuid().ToString('N') + '.json')
        $out = (& curl.exe -sS -L -m 90 -H 'Accept: application/json' -o $tmp -w '%{http_code}|%{size_download}' $url 2>&1 | Out-String).Trim()
        $code = '000'; $bytes = 0
        $parts = $out -split '\|'
        if ($parts.Count -ge 2) { $code = $parts[0]; [void][int]::TryParse($parts[1], [ref]$bytes) }

        $text = ''
        if (Test-Path $tmp) { $text = [System.IO.File]::ReadAllText($tmp); Remove-Item $tmp -Force -ErrorAction SilentlyContinue }

        $valid = $false; $count = 0; $err = ''
        if ([string]::IsNullOrWhiteSpace($text)) { $err = 'empty response' }
        elseif ($text.TrimStart().StartsWith('<')) { $err = 'non-JSON response' }
        else {
            try {
                $obj = $text | ConvertFrom-Json
                $count = @($obj).Count
                $valid = $true
                [System.IO.File]::WriteAllText($file, $text, $utf8)
                $combined += [pscustomobject]@{
                    planet = $p
                    fetched_at = (Get-Date).ToString('s')
                    properties = $obj
                }
            }
            catch { $err = $_.Exception.Message }
        }

        $index += [pscustomobject]@{
            planet = $p; http = $code; bytes = $bytes; entries = $count
            json_valid = $valid; file = ($slug + '.json'); error = $err
        }
        Start-Sleep -Milliseconds 250
    }

    $latest = Join-Path $dir 'latest.json'
    $combinedJson = $combined | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($latest, $combinedJson, $utf8)
    Copy-Item $latest (Join-Path $dir ("{0}.json" -f $stamp)) -Force
    $indexJson = $index | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText((Join-Path $dir 'index.json'), $indexJson, $utf8)

    $ok = @($index | Where-Object { -not $_.json_valid }).Count -eq 0
    return [pscustomobject]@{
        source = 'exomast'; http = '200'; bytes = (Get-Item $latest).Length
        records = $combined.Count; json_valid = $ok; shape = 'per-planet'
        note = 'Exo.MAST per-planet properties'; error = ''
    }
}

# ------------------------------------------------------------------ run ----
$records = @()

foreach ($name in $tapSources.Keys) {
    if ($Sources -notcontains $name) { continue }
    $rec = Save-TapSource -Name $name -Cfg $tapSources[$name]
    $records += $rec
    '{0,-13} http={1,-4} bytes={2,-9} records={3,-6} valid={4} {5}' -f `
        $rec.source, $rec.http, $rec.bytes, $rec.records, $rec.json_valid, $rec.error
}

if ($Sources -contains 'exomast') {
    $rec = Save-ExoMast -Planets $ExoMastPlanets
    $records += $rec
    '{0,-13} http={1,-4} bytes={2,-9} planets={3,-6} valid={4}' -f `
        $rec.source, $rec.http, $rec.bytes, $rec.records, $rec.json_valid
}

if (-not $SkipNormalize) {
    foreach ($name in $tapSources.Keys) {
        if ($Sources -notcontains $name) { continue }
        $n = Convert-TapToObjects -Name $name
        if ($n) { '{0,-13} normalized: rows={1} columns={2}' -f $name, $n.rows, $n.columns }
    }
}

$failed = @($records | Where-Object { -not $_.json_valid })
if ($records.Count -eq 0) {
    Write-Warning ('Ни один источник не выбран. Доступны: ' + ($tapSources.Keys -join ', ') + ', exomast')
    exit 2
}

$manifest = foreach ($r in $records) {
    $dir = Join-Path $OutDir $r.source
    $versions = @(Get-ChildItem $dir -Filter '*.json' -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -match '^\d{8}_\d{6}$' }).Count
    [pscustomobject]@{
        source = $r.source
        raw = "data/backups/$($r.source)/latest.json"
        bytes = $r.bytes
        records = $r.records
        shape = $r.shape
        json_valid = $r.json_valid
        versions = $versions
        note = $r.note
        error = $r.error
    }
}
$manifestJson = $manifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $OutDir 'manifest.json'), $manifestJson, $utf8)

if ($failed.Count -gt 0) {
    Write-Warning ("Источники с ошибкой: " + (($failed | ForEach-Object { $_.source }) -join ', '))
    exit 1
}
exit 0
