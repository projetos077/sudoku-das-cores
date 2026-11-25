// Conversa de recados no estilo WhatsApp (a mesma no app do Theo e no painel do pai).
// Recebidos vêm de window.Recados (servidor ou este aparelho). Os que eu mandei ficam guardados
// aqui (IndexedDB) para ouvir de novo enquanto espero; os tiques mostram se o outro já ouviu.
(function () {
  'use strict';
  const GUARDAR_MEUS = 6; // quantos recados meus ficam na conversa
  const ATUALIZAR_MS = 4000;

  const abrir = () => new Promise((ok, erro) => {
    const q = indexedDB.open('sudoku-theo-meus', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('meus', { keyPath: 'chave', autoIncrement: true });
    q.onsuccess = () => ok(q.result);
    q.onerror = () => erro(q.error);
  });
  const loja = (modo, fn) => abrir().then(d => new Promise((ok, erro) => {
    const tx = d.transaction('meus', modo), r = fn(tx.objectStore('meus'));
    tx.oncomplete = () => ok(r && r.result);
    tx.onerror = () => erro(tx.error);
  }));

  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const hora = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 21 3l-7.5 18-2.7-7.3z"/></svg>';
  const TICKS = { enviando: '🕓', erro: '⚠️', enviado: '✓', ouvido: '✓✓' };

  function motivo(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'Microfone bloqueado. Libere o microfone para este site nos ajustes.';
    if (n === 'NotFoundError') return 'Nenhum microfone encontrado.';
    return 'Não deu certo' + (e && e.message ? ` (${e.message})` : '') + '.';
  }

  function montar(raiz, { eu, nomeOutro, inicialOutro, corOutro, inicialEu, som = () => {}, aoOuvido = () => {} }) {
    const R = () => window.Recados;
    raiz.classList.add('wa');
    raiz.innerHTML = `<div class="wa-msgs" role="log" aria-label="Recados"><p class="wa-vazio">Carregando…</p></div>
      <p class="wa-aviso" hidden></p>
      <div class="wa-barra" data-estado="parado">
        <button class="wa-lixo" type="button" aria-label="Apagar gravação">🗑</button>
        <span class="wa-dica">Toque para gravar</span>
        <span class="wa-rec" aria-live="polite"><i class="wa-ponto"></i><b>0:00</b><span class="wa-ondas"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></span>
        <button class="wa-mic" type="button" aria-label="Gravar recado">${MIC}</button>
        <button class="wa-enviar" type="button" aria-label="Enviar recado">${SETA}</button>
      </div>`;
    const msgs = raiz.querySelector('.wa-msgs'), barra = raiz.querySelector('.wa-barra'), aviso = raiz.querySelector('.wa-aviso');
    const els = new Map(); // chave da bolha → elemento (assim tocar não é interrompido ao atualizar)
    let parar = null, inicio = 0, relogio = null, tocando = null, ultimoTotal = 0;

    const avisar = t => { aviso.textContent = t || ''; aviso.hidden = !t; };
    const fase = f => { barra.dataset.estado = f; };

    // ---------- tocar ----------
    function soltarAtual() {
      if (!tocando) return;
      tocando.audio.pause();
      tocando.bolha.classList.remove('tocando');
      tocando.bolha.querySelector('.wa-play').textContent = '▶';
      tocando = null;
    }
    function acompanhar(bolha, audio, duracaoMs) {
      tocando = { bolha, audio };
      bolha.classList.add('tocando');
      bolha.querySelector('.wa-play').textContent = '❚❚';
      const trilho = bolha.querySelector('.wa-trilho i'), dur = bolha.querySelector('.wa-dur');
      audio.addEventListener('timeupdate', () => {
        const total = isFinite(audio.duration) ? audio.duration * 1000 : duracaoMs;
        if (total) trilho.style.width = Math.min(100, audio.currentTime * 1000 / total * 100) + '%';
        dur.textContent = mmss(audio.currentTime * 1000);
      });
      audio.addEventListener('ended', () => {
        trilho.style.width = '100%';
        if (duracaoMs) dur.textContent = mmss(duracaoMs);
        if (tocando && tocando.audio === audio) soltarAtual();
      });
    }
    function tocarMeu(bolha, m) {
      const era = tocando && tocando.bolha === bolha;
      soltarAtual();
      if (era) return;
      const audio = new Audio(URL.createObjectURL(m.blob));
      audio.addEventListener('ended', () => URL.revokeObjectURL(audio.src));
      acompanhar(bolha, audio, m.duracaoMs);
      audio.play().catch(soltarAtual);
    }
    function tocarRecebido(bolha, r) {
      const era = tocando && tocando.bolha === bolha;
      soltarAtual();
      if (era) return;
      const conta = bolha.querySelector('.wa-conta');
      const audio = R().tocar(r, {
        aoProgresso: () => {},
        aoContar: s => { conta.hidden = false; conta.textContent = s; conta.style.setProperty('--p', (1 - s * 1000 / R().APAGAR_APOS_OUVIR_MS) * 100 + '%'); bolha.classList.add('ouvida'); },
        aoErro: () => { soltarAtual(); avisar('Não consegui tocar o áudio. Toque no ▶ de novo.'); },
        aoApagar: () => { bolha.closest('.wa-linha').classList.add('sumindo'); setTimeout(atualizar, 450); },
      });
      if (audio) acompanhar(bolha, audio, 0);
    }

    // ---------- bolhas ----------
    function criar(item) {
      const linha = document.createElement('div');
      const meu = item.tipo === 'meu';
      linha.className = 'wa-linha ' + (meu ? 'eu' : 'outro');
      linha.innerHTML = `<div class="wa-bolha">
          <button class="wa-play" type="button" aria-label="Ouvir">▶</button>
          <span class="wa-trilho"><i></i></span>
          <span class="avatar wa-foto" style="background:${meu ? '#bf6234' : corOutro}">${meu ? inicialEu : inicialOutro}<i class="wa-mini">${MIC}</i></span>
          <small class="wa-info"><span class="wa-dur">${meu ? mmss(item.m.duracaoMs) : '🎤'}</span><span class="wa-hora">${hora(item.t)}</span>${meu ? '<span class="wa-ticks"></span>' : ''}</small>
          <span class="wa-conta count" hidden></span>
        </div>${meu ? '<small class="wa-estado"></small>' : ''}`;
      const bolha = linha.querySelector('.wa-bolha');
      if (!meu && item.r.ouvido_em) bolha.classList.add('ouvida');
      linha.querySelector('.wa-play').onclick = () => (meu ? tocarMeu(bolha, item.m) : tocarRecebido(bolha, item.r));
      return linha;
    }
    const TEXTO = { enviando: 'Enviando…', erro: 'Não enviou · toque para tentar de novo', enviado: `Enviado · esperando ${nomeOutro} ouvir`, ouvido: `${nomeOutro[0].toUpperCase() + nomeOutro.slice(1)} ouviu! 🎉` };
    function marcar(linha, m) {
      const est = m.estado;
      linha.dataset.estado = est;
      linha.querySelector('.wa-ticks').textContent = TICKS[est];
      linha.querySelector('.wa-estado').textContent = TEXTO[est];
      linha.querySelector('.wa-estado').onclick = est === 'erro' ? () => mandar(m) : null;
    }

    // ---------- atualizar (recebidos do servidor + meus guardados aqui) ----------
    let ocupado = false;
    async function atualizar() {
      if (ocupado) return;
      ocupado = true;
      try {
        let recebidos = [];
        try { recebidos = await R().deQuem(eu === 'pai' ? 'theo' : 'pai'); } catch { /* sem rede */ }
        let meus = [];
        try { meus = (await loja('readonly', s => s.getAll())).filter(m => m.de === eu); } catch { /* sem armazenamento */ }
        // Situação dos meus: pergunta só pelos que ainda não foram ouvidos.
        for (const m of meus) {
          if (m.id == null || m.estado === 'ouvido' || !R().situacao) continue;
          let sit = null;
          try { sit = await R().situacao(m.id); } catch { /* sem rede: fica como está */ }
          if (sit && sit !== m.estado) {
            if (sit === 'ouvido' && m.estado === 'enviado') { som('ouvido'); aoOuvido(); }
            m.estado = sit;
            loja('readwrite', s => s.put(m)).catch(() => {});
          }
        }
        const itens = [
          ...recebidos.map(r => ({ chave: 'r' + r.id, tipo: 'recebido', t: r.criado_em || r.criado, r })),
          ...meus.map(m => ({ chave: 'm' + m.chave, tipo: 'meu', t: m.criado, m })),
        ].sort((a, b) => new Date(a.t) - new Date(b.t));
        const vivas = new Set(itens.map(i => i.chave));
        els.forEach((el, k) => { if (!vivas.has(k) && !(tocando && el.contains(tocando.bolha))) { el.remove(); els.delete(k); } });
        itens.forEach(i => {
          let el = els.get(i.chave);
          if (!el) { el = criar(i); els.set(i.chave, el); }
          if (i.tipo === 'meu') marcar(el, i.m);
          msgs.append(el); // mantém a ordem
        });
        msgs.querySelector('.wa-vazio')?.remove();
        if (!itens.length) msgs.insertAdjacentHTML('beforeend', `<p class="wa-vazio">Nenhum recado ainda. Grave um para ${nomeOutro}! 🎤</p>`);
        if (itens.length !== ultimoTotal) { msgs.scrollTop = msgs.scrollHeight; ultimoTotal = itens.length; }
      } finally { ocupado = false; }
    }

    // ---------- gravar e enviar ----------
    async function mandar(m) {
      m.estado = 'enviando';
      await loja('readwrite', s => s.put(m)).catch(() => {});
      await atualizar();
      try {
        m.id = await R().enviar(eu, m.blob);
        m.estado = 'enviado';
        som('enviado');
        avisar('');
      } catch (e) { m.estado = 'erro'; avisar(motivo(e)); }
      await loja('readwrite', s => s.put(m)).catch(() => {});
      // guarda só os últimos
      const meus = (await loja('readonly', s => s.getAll()).catch(() => [])).filter(x => x.de === eu);
      for (const velho of meus.slice(0, Math.max(0, meus.length - GUARDAR_MEUS))) await loja('readwrite', s => s.delete(velho.chave)).catch(() => {});
      atualizar();
    }

    async function comecar() {
      soltarAtual();
      avisar('');
      if (!R().podeGravar()) return avisar('Este aparelho não deixa gravar áudio aqui.');
      try { parar = await R().gravar(eu); }
      catch (e) { parar = null; return avisar(motivo(e)); }
      fase('gravando');
      inicio = Date.now();
      barra.querySelector('.wa-rec b').textContent = '0:00';
      relogio = setInterval(() => { barra.querySelector('.wa-rec b').textContent = mmss(Date.now() - inicio); }, 250);
      som('gravar');
    }
    async function terminar(enviar) {
      if (!parar) return;
      clearInterval(relogio);
      const p = parar, duracaoMs = Date.now() - inicio;
      parar = null;
      fase('parado');
      let blob;
      try { blob = await p(); } catch (e) { return avisar(motivo(e)); }
      if (!enviar) return som('apagar');
      if (duracaoMs < 700) return avisar('Muito curtinho. Fale um pouco mais.');
      const m = { de: eu, blob, duracaoMs, criado: new Date().toISOString(), estado: 'enviando', id: null };
      try { m.chave = await loja('readwrite', s => s.add(m)); } catch { /* sem armazenamento: envia mesmo assim */ }
      mandar(m);
    }
    barra.querySelector('.wa-mic').onclick = comecar;
    barra.querySelector('.wa-enviar').onclick = () => terminar(true);
    barra.querySelector('.wa-lixo').onclick = () => terminar(false);

    setInterval(() => { if (raiz.offsetParent) atualizar(); }, ATUALIZAR_MS);
    atualizar();
    return { atualizar };
  }

  window.Conversa = montar;
})();
