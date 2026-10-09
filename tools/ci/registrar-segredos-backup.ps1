# Plataforma de Membros LAIFT
# © 2026 Daniel Pires Francisco. Todos os direitos reservados.
# Licença proprietária: ver LICENSE na raiz do repositório.
#
# Cadastra os 6 secrets do workflow "Backup do banco" (.github/workflows/backup.yml):
#   BACKUP_DATABASE_URL, BACKUP_AGE_PUBLIC_KEY, R2_ACCOUNT_ID,
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BACKUP_BUCKET
#
# Rode na SUA máquina, com o `gh` logado (nada passa pelo chat):
#   powershell -ExecutionPolicy Bypass -File tools\ci\registrar-segredos-backup.ps1
#
# Antes de rodar, tenha em mãos (docs/BACKUP_RESTORE.md, passos 2 e 3):
#   - a URL DIRETA (sem -pooler) do papel laift_backup no Neon;
#   - o ID da conta Cloudflare, o nome do bucket R2 privado e o par de chaves do
#     token R2 "Object Read & Write" limitado ao bucket.
# A chave age é gerada aqui (precisa do `age-keygen`: winget install FiloSottile.age).
# Se você já tem a chave, use -PularChave e cole só a chave PÚBLICA (age1...).
#
# Cada valor secreto é pedido sem eco e enviado ao `gh secret set` pela entrada
# padrão: nunca vai para a linha de comando, o histórico do shell ou a tela.
# -SomenteVerificar só lista quais dos 6 nomes já existem (não mostra valores).
param(
  [string]$Repositorio = 'Diretoria-DPF/plataforma-membros',
  [string]$PastaChave = (Join-Path $env:USERPROFILE 'laift-backup-chave'),
  [switch]$PularChave,
  [switch]$SomenteVerificar
)

$ErrorActionPreference = 'Stop'

$Nomes = @(
  'BACKUP_DATABASE_URL', 'BACKUP_AGE_PUBLIC_KEY', 'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BACKUP_BUCKET'
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) nao encontrado.' }

# Grava o valor como secret, escrevendo na entrada padrao do gh (sem quebra de linha final).
function Set-RepoSecret([string]$Nome, [string]$Valor) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'gh'
  $psi.Arguments = "secret set $Nome --repo $Repositorio"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.StandardInput.Write($Valor)
  $proc.StandardInput.Close()
  $proc.WaitForExit()
  if ($proc.ExitCode -ne 0) { throw "O gh nao conseguiu registrar $Nome. $($proc.StandardError.ReadToEnd())" }
  Write-Host "  ok: $Nome registrado (valor nao exibido)."
}

# Le um valor secreto sem eco.
function Read-Secreto([string]$Pergunta) {
  $seguro = Read-Host -Prompt $Pergunta -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try { $valor = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ([string]::IsNullOrWhiteSpace($valor)) { throw "Valor vazio: $Pergunta" }
  return $valor.Trim()
}

function Show-Situacao {
  $linhas = gh secret list --repo $Repositorio
  $existentes = @()
  foreach ($l in $linhas) { $existentes += ($l -split '\s+')[0] }
  Write-Host ''
  Write-Host "Secrets do backup em ${Repositorio}:"
  foreach ($n in $Nomes) {
    $estado = if ($existentes -contains $n) { 'OK   ' } else { 'FALTA' }
    Write-Host "  [$estado] $n"
  }
  return (@($Nomes | Where-Object { $existentes -notcontains $_ })).Count
}

if ($SomenteVerificar) {
  $faltam = Show-Situacao
  if ($faltam -gt 0) { exit 1 } else { exit 0 }
}

Write-Host '1/4  Chave age (BACKUP_AGE_PUBLIC_KEY)'
if ($PularChave) {
  $pub = (Read-Host 'Cole a chave PUBLICA age (age1...)').Trim()
} else {
  if (-not (Get-Command age-keygen -ErrorAction SilentlyContinue)) {
    throw 'age-keygen nao encontrado. Instale com "winget install FiloSottile.age" ou rode de novo com -PularChave.'
  }
  New-Item -ItemType Directory -Force -Path $PastaChave | Out-Null
  $arquivoChave = Join-Path $PastaChave 'laift-backup.key'
  if (Test-Path -LiteralPath $arquivoChave) {
    throw "Ja existe $arquivoChave. Nao vou sobrescrever a chave privada: use -PularChave ou outra -PastaChave."
  }
  & age-keygen -o $arquivoChave | Out-Null
  try { & icacls $arquivoChave /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null } catch { }
  $pub = (& age-keygen -y $arquivoChave | Select-Object -First 1).Trim()
  Write-Host "  Chave PRIVADA salva em: $arquivoChave"
  Write-Host '  GUARDE essa chave em DOIS lugares fora deste computador (gerenciador de senhas + pendrive/cofre).'
  Write-Host '  Sem ela, os backups nao abrem. Ela nunca vai ao GitHub nem ao chat.'
}
if ($pub -notmatch '^age1[a-z0-9]{50,}$') { throw 'Isso nao parece uma chave publica age (age1...).' }
Set-RepoSecret 'BACKUP_AGE_PUBLIC_KEY' $pub

Write-Host ''
Write-Host '2/4  Banco (BACKUP_DATABASE_URL): URL DIRETA do papel laift_backup, sem -pooler'
$url = Read-Secreto 'BACKUP_DATABASE_URL (postgresql://...)'
if ($url -notmatch '^postgres(ql)?://') { throw 'Esperava uma URL que comece com postgresql://' }
if ($url -match '-pooler') { throw 'Use a URL DIRETA (sem -pooler): o pg_dump nao funciona pelo pooler.' }
Set-RepoSecret 'BACKUP_DATABASE_URL' $url
$url = $null

Write-Host ''
Write-Host '3/4  Cloudflare R2'
$conta = (Read-Host 'R2_ACCOUNT_ID (32 caracteres, painel da Cloudflare)').Trim()
if ($conta -notmatch '^[0-9a-fA-F]{32}$') { throw 'O ID da conta Cloudflare tem 32 caracteres hexadecimais.' }
Set-RepoSecret 'R2_ACCOUNT_ID' $conta
$bucket = (Read-Host 'R2_BACKUP_BUCKET (nome do bucket privado)').Trim()
if ($bucket -notmatch '^[a-z0-9][a-z0-9-]{2,62}$') { throw 'Nome de bucket invalido (minusculas, numeros e hifens).' }
Set-RepoSecret 'R2_BACKUP_BUCKET' $bucket
$chaveId = Read-Secreto 'R2_ACCESS_KEY_ID'
Set-RepoSecret 'R2_ACCESS_KEY_ID' $chaveId
$chaveId = $null
$chaveSecreta = Read-Secreto 'R2_SECRET_ACCESS_KEY'
Set-RepoSecret 'R2_SECRET_ACCESS_KEY' $chaveSecreta
$chaveSecreta = $null

Write-Host ''
Write-Host '4/4  Conferencia'
$faltam = Show-Situacao
if ($faltam -eq 0) {
  Write-Host ''
  Write-Host 'Pronto. Proximo passo: Actions > "Backup do banco" > Run workflow (uma vez, a mao).'
} else {
  Write-Host ''
  Write-Host "Ainda faltam $faltam secret(s). Rode de novo ou cadastre com: gh secret set NOME --repo $Repositorio"
  exit 1
}
