# Plataforma de Membros LAIFT
# © 2026 Daniel Pires Francisco. Todos os direitos reservados.
# Licença proprietária: ver LICENSE na raiz do repositório.
#
# Gera a chave que cifra os segredos do MFA (MFA_ENCRYPTION_KEY) e a cadastra no
# Worker pelo `wrangler secret put`, SEM imprimir o valor. Guarda uma cópia num
# arquivo FORA do repositório para você colocar no cofre de senhas.
#
#   powershell -ExecutionPolicy Bypass -File tools\ci\gerar-segredo-mfa.ps1 -Ambiente staging
#   powershell -ExecutionPolicy Bypass -File tools\ci\gerar-segredo-mfa.ps1 -Ambiente producao
#
# Use valores DIFERENTES em staging e produção (o script gera uma chave nova a cada
# execução). Trocar a chave de um ambiente que já tem MFA ativado INVALIDA o MFA de
# todos: por isso o script recusa quando o segredo já existe (use -Substituir só se
# for isso mesmo que você quer) e quando o arquivo de cópia já existe.
# Exige o `wrangler` autenticado (npx wrangler login).
param(
  [Parameter(Mandatory = $true)][ValidateSet('staging', 'producao')][string]$Ambiente,
  [string]$SalvarEm = '',
  [switch]$Substituir
)

# 'Continue' (não 'Stop'): no Windows PowerShell 5.1 qualquer linha que o wrangler escreva no stderr (um
# simples aviso de versão) viraria erro. Os comandos nativos são conferidos por $LASTEXITCODE e os
# cmdlets que gravam usam -ErrorAction Stop.
$ErrorActionPreference = 'Continue'
$Nome = 'MFA_ENCRYPTION_KEY'
$Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Worker = Join-Path $Raiz 'worker'
if (-not (Test-Path -LiteralPath (Join-Path $Worker 'wrangler.toml'))) { throw "worker\wrangler.toml não encontrado em $Worker" }
if ([string]::IsNullOrWhiteSpace($SalvarEm)) { $SalvarEm = Join-Path $env:USERPROFILE "Desktop\segredo-mfa-$Ambiente.txt" }
if ((Test-Path -LiteralPath $SalvarEm) -and -not $Substituir) { throw "Já existe $SalvarEm. Não vou sobrescrever uma cópia que pode ser a única da chave em uso." }

$EnvArgs = @()
if ($Ambiente -eq 'staging') { $EnvArgs = @('--env', 'staging') }

Push-Location $Worker
try {
  & npx --yes wrangler whoami *> $null
  if ($LASTEXITCODE -ne 0) { throw 'O wrangler não está autenticado. Rode: npx wrangler login' }

  $lista = (& npx --yes wrangler secret list @EnvArgs) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw 'Não consegui listar os segredos do Worker.' }
  if ($lista -match $Nome -and -not $Substituir) {
    throw "$Nome já existe em $Ambiente. Trocar invalida o MFA de todos; use -Substituir só se for intencional."
  }

  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $chave = -join ($bytes | ForEach-Object { $_.ToString('x2') })

  # Primeiro o cofre local, depois o Worker: se o wrangler falhar, a chave não se perde nem fica órfã.
  $cabecalho = "LAIFT - $Nome ($Ambiente) gerada em $((Get-Date).ToString('yyyy-MM-dd HH:mm'))`r`nGuarde no cofre de senhas e apague este arquivo. Perder esta chave invalida o MFA de todos.`r`n`r`n"
  Set-Content -LiteralPath $SalvarEm -Value ($cabecalho + $chave) -Encoding UTF8 -ErrorAction Stop
  & icacls $SalvarEm /inheritance:r /grant:r "${env:USERNAME}:(R,W)" *> $null

  $chave | & npx --yes wrangler secret put $Nome @EnvArgs
  if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $SalvarEm -Force -ErrorAction Stop
    throw 'O wrangler não conseguiu gravar o segredo; a cópia local foi removida.'
  }
  $chave = $null
} finally {
  Pop-Location
}

Write-Host "$Nome cadastrada em $Ambiente (valor não exibido)."
Write-Host "Cópia para o cofre: $SalvarEm"
Write-Host 'Depois de guardar no cofre, apague o arquivo.'
