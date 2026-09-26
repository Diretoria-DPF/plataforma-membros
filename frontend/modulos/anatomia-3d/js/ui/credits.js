/**
 * credits.js — Modal de créditos e licenças para o Atlas Anatômico
 */

/**
 * Agrupa assets por license + attribution, retornando uma lista ordenada
 * de {license, attribution, sourceUrl, sourceVersion, systems: [...]}.
 */
function groupAssets(assets) {
  const groups = new Map();

  for (const asset of assets) {
    const key = `${asset.license}|${asset.attribution}`;
    if (!groups.has(key)) {
      groups.set(key, {
        license: asset.license,
        attribution: asset.attribution,
        sourceUrl: asset.sourceUrl,
        sourceVersion: asset.sourceVersion,
        systems: new Set(),
      });
    }
    const group = groups.get(key);
    if (asset.system) {
      group.systems.add(asset.system);
    }
  }

  // Converter Set para Array e ordenar
  const result = Array.from(groups.values()).map((g) => ({
    ...g,
    systems: Array.from(g.systems).sort(),
  }));

  // Ordenar grupos por license, depois por attribution
  result.sort((a, b) => {
    if (a.license !== b.license) return a.license.localeCompare(b.license);
    return a.attribution.localeCompare(b.attribution);
  });

  return result;
}

/**
 * Licenças conhecidas: mapping para URL
 */
const LICENSE_URLS = {
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

const LICENSE_LABELS = {
  'CC-BY-SA-4.0': 'CC BY-SA 4.0',
  'CC-BY-4.0': 'CC BY 4.0',
  'CC0-1.0': 'CC0 1.0',
};

/**
 * createCredits({manifest, contentSources = []})
 * Retorna {open(), close(), element}
 */
function createCredits({ manifest, contentSources = [] }) {
  const { h, safeUrl } = LaiftDom;

  // Dialog element
  const dialog = h('dialog', {
    role: 'dialog',
    'aria-modal': 'true',
    className: 'credits-modal',
  });

  // Conteúdo do dialog
  const content = h('div', { className: 'credits-content' });

  // Título
  const title = h('h1', { className: 'credits-title', text: 'Créditos e licenças' });

  // Botão fechar
  const closeBtn = h('button', {
    className: 'credits-close',
    'aria-label': 'Fechar',
    onClick: () => close(),
  }, '×');

  const header = h('div', { className: 'credits-header' }, [title, closeBtn]);

  // Container scrollável
  const scrollContainer = h('div', { className: 'credits-scroll' });

  // Seção de Modelos 3D
  const modelsSection = h('section', { className: 'credits-section' });
  const modelsTitle = h('h2', { text: 'Modelos 3D' });
  modelsSection.appendChild(modelsTitle);

  // Agrupar assets
  const groups = groupAssets(manifest.assets || []);

  for (const group of groups) {
    const groupDiv = h('div', { className: 'credits-group' });

    // Attribution
    const attribution = h('p', { className: 'credits-attribution', text: group.attribution });
    groupDiv.appendChild(attribution);

    // License link
    const licenseLabel = LICENSE_LABELS[group.license] || group.license;
    const licenseUrl = LICENSE_URLS[group.license];
    const licenseLine = h('p', { className: 'credits-license' });
    if (licenseUrl) {
      const licenseLink = h('a', {
        href: licenseUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: licenseLabel,
      });
      licenseLine.appendChild(licenseLink);
    } else {
      licenseLine.textContent = licenseLabel;
    }
    groupDiv.appendChild(licenseLine);

    // Source URL
    if (group.sourceUrl) {
      const sourceLine = h('p', { className: 'credits-source' });
      const sourceLink = h('a', {
        href: safeUrl(group.sourceUrl),
        target: '_blank',
        rel: 'noopener noreferrer',
        text: group.sourceUrl,
      });
      sourceLine.appendChild(sourceLink);
      groupDiv.appendChild(sourceLine);
    }

    // Source Version
    if (group.sourceVersion) {
      const versionLine = h('p', { className: 'credits-version', text: `Versão: ${group.sourceVersion}` });
      groupDiv.appendChild(versionLine);
    }

    // Systems
    if (group.systems.length > 0) {
      const systemsLine = h('p', { className: 'credits-systems', text: `Sistemas: ${group.systems.join(', ')}` });
      groupDiv.appendChild(systemsLine);
    }

    modelsSection.appendChild(groupDiv);
  }

  scrollContainer.appendChild(modelsSection);

  // Seção de Conteúdo
  if (contentSources.length > 0) {
    const contentSection = h('section', { className: 'credits-section' });
    const contentTitle = h('h2', { text: 'Conteúdo' });
    contentSection.appendChild(contentTitle);

    for (const source of contentSources) {
      const sourceDiv = h('div', { className: 'credits-group' });

      const typeLabel = h('p', { className: 'credits-type', text: source.type });
      sourceDiv.appendChild(typeLabel);

      if (source.ref) {
        const refP = h('p', { className: 'credits-ref', text: `Referência: ${source.ref}` });
        sourceDiv.appendChild(refP);
      }

      if (source.license) {
        const licenseP = h('p', { className: 'credits-license', text: `Licença: ${source.license}` });
        sourceDiv.appendChild(licenseP);
      }

      if (source.url) {
        const urlLine = h('p', { className: 'credits-url' });
        const urlLink = h('a', {
          href: safeUrl(source.url),
          target: '_blank',
          rel: 'noopener noreferrer',
          text: source.url,
        });
        urlLine.appendChild(urlLink);
        sourceDiv.appendChild(urlLine);
      }

      contentSection.appendChild(sourceDiv);
    }

    scrollContainer.appendChild(contentSection);
  }

  // Fixed notes
  const notesSection = h('section', { className: 'credits-section' });
  const notesTitle = h('h2', { text: 'Notas' });
  notesSection.appendChild(notesTitle);

  const shareAlikeNote = h('p', { className: 'credits-note' });
  shareAlikeNote.textContent = 'Modelos derivados do Z-Anatomy são distribuídos sob CC BY-SA 4.0: podem ser reutilizados com atribuição e sob a mesma licença.';
  notesSection.appendChild(shareAlikeNote);

  const draftNote = h('p', { className: 'credits-note' });
  draftNote.textContent = 'Textos marcados como "Rascunho — não revisado" ainda aguardam revisão por profissionais de saúde.';
  notesSection.appendChild(draftNote);

  const libNote = h('p', { className: 'credits-note' });
  libNote.textContent = 'Biblioteca 3D: three.js (MIT).';
  notesSection.appendChild(libNote);

  scrollContainer.appendChild(notesSection);

  // Montar estrutura
  content.appendChild(header);
  content.appendChild(scrollContainer);
  dialog.appendChild(content);

  // Funções públicas
  function open() {
    dialog.showModal();
    document.addEventListener('keydown', handleEsc);
  }

  function close() {
    dialog.close();
    document.removeEventListener('keydown', handleEsc);
  }

  function handleEsc(e) {
    if (e.key === 'Escape') {
      close();
    }
  }

  return { open, close, element: dialog };
}

// Exportar para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createCredits, groupAssets };
}
