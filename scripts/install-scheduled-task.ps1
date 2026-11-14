<#
.SYNOPSIS
  Регистрация задачи Планировщика Windows: обновление резервных копий
  и выгрузка в Supabase каждые N часов.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\install-scheduled-task.ps1
  powershell -ExecutionPolicy Bypass -File scripts\install-scheduled-task.ps1 -Remove
  powershell -ExecutionPolicy Bypass -File scripts\install-scheduled-task.ps1 -EveryHours 6
#>

[CmdletBinding()]
param(
  # Корень репозитория (по умолчанию — два уровня выше этого скрипта).
  [string]$RepoPath = '',
  # Период запуска в часах.
  [int]$EveryHours = 3,
  # Имя задачи в Планировщике.
  [string]$TaskName = 'ExoCatalogRefresh',
  # Удалить задачу вместо регистрации.
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

if (-not $RepoPath) {
  $here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $RepoPath = Split-Path -Parent $here
}

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Задача «$TaskName» удалена."
  return
}

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) {
  $npm = Join-Path ${env:ProgramFiles} 'nodejs\npm.cmd'
}
if (-not (Test-Path $npm)) {
  throw "Не найден npm.cmd — укажите путь вручную или добавьте Node.js в PATH."
}

$logDir = Join-Path $RepoPath 'data\archives'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'refresh.log'

# Запуск идёт через .cmd-обёртку: в `cmd /c` путь с пробелами требует
# дополнительного экранирования кавычками, из-за чего задача падала.
$wrapper = Join-Path $RepoPath 'scripts\refresh-backup.cmd'
if (-not (Test-Path $wrapper)) {
  throw "Не найден файл $wrapper."
}

$action = New-ScheduledTaskAction `
  -Execute 'cmd.exe' `
  -Argument ('/c ""' + $wrapper + '""') `
  -WorkingDirectory $RepoPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
  -RepetitionInterval (New-TimeSpan -Hours $EveryHours) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 90)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Обновление резервных копий каталога экзопланет и выгрузка в Supabase' -Force | Out-Null

Write-Host "Задача «$TaskName» зарегистрирована: каждые $EveryHours ч."
Write-Host "  Рабочий каталог: $RepoPath"
Write-Host "  Журнал:          $log"
Write-Host "  Запуск вручную:  Start-ScheduledTask -TaskName '$TaskName'"
