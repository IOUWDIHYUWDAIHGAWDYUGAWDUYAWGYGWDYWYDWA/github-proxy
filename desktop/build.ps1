$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$output = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$references = @('/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.ServiceProcess.dll','/r:System.Security.dll','/r:System.Core.dll')
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output "/out:$output\GithubProxyVPN.exe" "/win32manifest:$PSScriptRoot\app.manifest" @references "$PSScriptRoot\Program.cs"
if ($LASTEXITCODE -ne 0) { throw 'Application build failed' }
& $compiler /nologo /target:exe /platform:x64 /utf8output "/out:$output\ValidationTests.exe" @references "$PSScriptRoot\Program.cs"
if ($LASTEXITCODE -ne 0) { throw 'Test build failed' }
& "$output\ValidationTests.exe" --self-test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
Write-Output "Ready: $output\GithubProxyVPN.exe"
