css:
<style>
  :root {
    --bg: #f3f6fb;
    --surface: #ffffff;
    --surface-alt: #f8fafc;
    --border: #dbe4f0;
    --text: #1f2937;
    --muted: #64748b;
    --primary: #0f766e;
    --primary-soft: #dff7f3;
    --admin: #9a3412;
    --admin-soft: #fff1e8;
    --member: #155e75;
    --member-soft: #e6f7fb;
    --success: #166534;
    --error: #b91c1c;
    --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
    --radius: 18px;
  }


  * { box-sizing: border-box; }


  body {
    margin: 0;
    font-family: Inter, "Segoe UI", sans-serif;
    background: linear-gradient(180deg, #eef4fb 0%, #f8fafc 100%);
    color: var(--text);
  }


  .layout {
    min-height: 100vh;
    padding: 24px;
  }


  .authCard, .painel {
    max-width: 1200px;
    margin: 0 auto;
  }


  .authCard {
    max-width: 500px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    border-radius: 24px;
    padding: 32px;
    margin-top: 60px;
  }


  .painelAdmin .rotulo { color: var(--admin); }
  .painelMembro .rotulo { color: var(--member); }


  .marca {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--primary-soft);
    color: var(--primary);
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 12px;
    user-select: none;
    cursor: default;
  }


  h1, h2, h3, h4 { margin-top: 0; margin-bottom: 10px; line-height: 1.2; }


  .textoApoio, .rotulo { color: var(--muted); }


  .rotulo {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }


  form {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }


  input, select, textarea, button {
    font: inherit;
  }


  input, select, textarea {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 14px 16px;
    background: var(--surface);
    color: var(--text);
  }


  textarea { min-height: 110px; resize: vertical; }


  input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible {
    outline: 3px solid rgba(15, 118, 110, 0.18);
    outline-offset: 1px;
    border-color: var(--primary);
  }


  button {
    border: 0;
    border-radius: 14px;
    padding: 14px 18px;
    background: var(--primary);
    color: #fff;
    cursor: pointer;
    font-weight: 600;
  }


  button:hover { filter: brightness(0.98); }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(0.1);
  }


  .btnAdmin { background: var(--admin); }


  .acoesAuth {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 16px;
  }


  .linkBtn {
    background: transparent;
    color: var(--muted);
    padding: 0;
    border-radius: 0;
  }


  .linkBtn:hover { color: var(--text); }


  .caixaPolitica {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 12px 14px;
    background: var(--surface-alt);
    font-size: 14px;
    color: var(--muted);
  }


  .caixaPolitica input {
    width: auto;
    margin-top: 2px;
  }


  .topoPainel { margin-bottom: 18px; }


  .menuPainel {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 22px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 10px 12px;
    box-shadow: var(--shadow);
  }


  .grupoMenu {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }


  .grupoSaida { margin-left: auto; }


  .abaNav {
    width: auto;
    background: transparent;
    color: var(--muted);
    padding: 10px 14px;
  }


  .abaAtiva {
    background: var(--member-soft);
    color: var(--member);
  }


  .abaAtivaAdmin {
    background: var(--admin-soft);
    color: var(--admin);
  }


  .btnSaida {
    background: #fff7ed;
    color: #9a3412;
  }


  .gradeIndicadores {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
  }


  .cardIndicador, .cardSecao, .itemLista, .blocoVotacao, .quorumItem {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }


  .cardIndicador { padding: 18px; }


  .cardIndicador span {
    display: block;
    color: var(--muted);
    font-size: 14px;
    margin-bottom: 8px;
  }


  .cardIndicador strong { font-size: 28px; }


  .painelGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }


  .cardSecao { padding: 20px; }


  .itemLista {
    padding: 16px;
    margin-bottom: 12px;
  }


  .itemLista p {
    margin: 6px 0;
    color: var(--muted);
  }


  .linhaMeta {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 14px;
    color: var(--muted);
    margin-top: 8px;
  }


  .blocoVotacao {
    padding: 18px;
    margin-bottom: 14px;
  }


  .blocoVotacao.votoConcluido {
    opacity: 0.82;
    background: #f8fafc;
  }


  .acoesVoto {
    display: flex;
    gap: 10px;
    margin-top: 12px;
    flex-wrap: wrap;
  }


  .acoesVoto button { width: auto; }


  .tag {
    display: inline-block;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--surface-alt);
    color: var(--muted);
    margin-bottom: 10px;
  }


  .status {
    min-height: 20px;
    margin-top: 12px;
    font-size: 14px;
  }


  .status-sucesso { color: var(--success); }
  .status-erro { color: var(--error); }
  .status-info { color: var(--muted); }


  .blocoQuorum { margin-top: 18px; }


  .quorumLista {
    display: grid;
    gap: 12px;
  }


  .quorumItem {
    padding: 16px;
  }


  .barraQuorum {
    margin-top: 10px;
    height: 10px;
    width: 100%;
    background: #e5edf6;
    border-radius: 999px;
    overflow: hidden;
  }


  .barraQuorum span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--primary), var(--member));
  }


  .acoesInline {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
    align-items: center;
  }


  .acoesInline select, .acoesInline input {
    max-width: 220px;
  }


  .modalConfirmacao {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 1000;
  }


  .modalBox {
    width: min(100%, 420px);
    background: var(--surface);
    border-radius: 20px;
    box-shadow: var(--shadow);
    border: 1px solid var(--border);
    padding: 24px;
  }


  .modalAcoes {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 18px;
  }


  .btnSecundario {
    background: #e5edf6;
    color: #334155;
  }


  .oculto { display: none !important; }


  @media (max-width: 960px) {
    .painelGrid { grid-template-columns: 1fr; }
  }


  @media (max-width: 720px) {
    .layout { padding: 14px; }
    .authCard { margin-top: 20px; padding: 22px; }
    .menuPainel {
      flex-direction: column;
      align-items: stretch;
    }
    .grupoMenu, .grupoSaida { width: 100%; }
    .grupoSaida { margin-left: 0; }
    .grupoMenu {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .grupoMenu .abaNav, .grupoSaida .abaNav {
      width: 100%;
    }
  }


  @media (max-width: 480px) {
    .grupoMenu { grid-template-columns: 1fr; }
    .cardSecao, .cardIndicador, .itemLista, .blocoVotacao, .quorumItem {
      padding: 14px;
    }
    .modalAcoes {
      flex-direction: column;
    }
    .modalAcoes button {
      width: 100%;
    }
  }
</style>