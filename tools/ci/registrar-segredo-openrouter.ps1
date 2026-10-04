# Plataforma de Membros LAIFT
# © 2026 Daniel Pires Francisco. Todos os direitos reservados.
# Licença proprietária: ver LICENSE na raiz do repositório.
#
# Registra a chave do OpenRouter como segredo OPENROUTER_API_KEY do repositório
# no GitHub (usada pelo Strix em .github/workflows/security.yml).
#
# Rode UMA vez, na sua máquina, com o `gh` logado:
#   powershell -ExecutionPolicy Bypass -File tools\ci\registrar-segredo-openrouter.ps1 `
#     -Arquivo "$env:USERPROFILE\Desktop\segredos-openrouter.json"
#
# O script lê o JSON localmente e envia a chave direto ao `gh secret set`, pela
# entrada padrão: o valor nunca é impresso, nem vai para a linha de comando, o
# histórico do shell ou o chat. Depois de registrar, APAGUE o arquivo do Desktop.
param(
  [Parameter(Mandatory = $true)][string]$Arquivo,
  [string]$Repositorio = 'Diretoria-DPF/plataforma-membros'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Arquivo)) { throw "Arquivo não encontrado: $Arquivo" }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) não encontrado.' }

$json = Get-Content -LiteralPath $Arquivo -Raw -Encoding UTF8 | ConvertFrom-Json

# Procura, em qualquer nível, o primeiro texto que tenha cara de chave do OpenRouter (sk-or-...).
function Find-Key($node) {
  if ($node -is [string]) { if ($node -match '^sk-or-[A-Za-z0-9_\-]{20,}$') { return $node }; return $null }
  if ($node -is [System.Management.Automation.PSCustomObject]) {
    foreach ($p in $node.PSObject.Properties) { $k = Find-Key $p.Value; if ($k) { return $k } }
  } elseif ($node -is [System.Collections.IEnumerable]) {
    foreach ($i in $node) { $k = Find-Key $i; if ($k) { return $k } }
  }
  return $null
}

$key = Find-Key $json
if (-not $key) { throw 'Nenhuma chave no formato sk-or-... foi encontrada no arquivo.' }

$key | gh secret set OPENROUTER_API_KEY --repo $Repositorio
if ($LASTEXITCODE -ne 0) { throw 'O gh não conseguiu registrar o segredo.' }
$key = $null

Write-Host "OPENROUTER_API_KEY registrada em $Repositorio (valor não exibido)."
Write-Host 'Agora apague o arquivo com a chave:'
Write-Host "  Remove-Item -LiteralPath '$Arquivo'"
