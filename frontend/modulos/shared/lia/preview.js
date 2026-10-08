/* Preview da Lia (nao entra no build): injeta lia.svg em cada .lia[data-preview]. */
(async function () {
  const res = await fetch('lia.svg');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  document.querySelectorAll('.lia[data-preview]').forEach((host) => {
    host.appendChild(document.importNode(svg, true));
  });
})().catch((err) => {
  document.body.textContent = 'Falha ao carregar lia.svg: ' + err.message;
});
