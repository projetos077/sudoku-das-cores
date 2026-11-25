(() => {
  'use strict';
  const L = window.Logica, JOGOS = window.JOGOS_REVISADOS;
  const CHAVE = 'sudoku-cores-theo-v2';
  const $ = s => document.querySelector(s);
  // Pedras da trilha (em % da imagem), de baixo para cima.
  const PEDRAS = [[540,1858],[652,1700],[546,1560],[420,1330],[519,1222],[673,1128],[710,1005],[610,920],[583,812],[519,693],[617,612],[706,520],[633,454],[563,357]];
  const UNIDADES = [];
  for (let r = 0; r < 4; r++) UNIDADES.push([0,1,2,3].map(c => r * 4 + c));
  for (let c = 0; c < 4; c++) UNIDADES.push([0,1,2,3].map(r => r * 4 + c));
  for (const r of [0, 2]) for (const c of [0, 2]) UNIDADES.push([r*4+c, r*4+c+1, (r+1)*4+c, (r+1)*4+c+1]);

  // ---------- estado salvo ----------
  let memoria = null;
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || L.estadoInicial(); } catch { return memoria || L.estadoInicial(); } };
  const salvar = e => { memoria = e; try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* segue só nesta sessão */ } };

  // ---------- som ----------
  let som = true, ac;
  function tom(f, t = 0, d = .25, vol = .2) {
    if (!som) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), s = ac.currentTime + t;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, s); g.gain.linearRampToValueAtTime(vol, s + .02); g.gain.exponentialRampToValueAtTime(.001, s + d);
      o.connect(g).connect(ac.destination); o.start(s); o.stop(s + d + .05);
    } catch { /* sem som no aparelho */ }
  }
  const vibrar = p => { if (som && navigator.vibrate) navigator.vibrate(p); };
  document.querySelectorAll('[data-som]').forEach(b => b.addEventListener('click', () => {
    som = !som;
    document.querySelectorAll('[data-som]').forEach(x => x.setAttribute('aria-label', som ? 'Desligar sons' : 'Ligar sons'));
  }));

  // ---------- telas ----------
  function mostrar(id) {
    document.querySelectorAll('.phone').forEach(t => t.classList.toggle('active', t.id === id));
    if (id !== 'tela-partida') pausar();
  }

  // ---------- trilha ----------
  function desenharTrilha() {
    const estado = ler(), sit = L.situacao(estado, L.dataLocal());
    const mapa = $('#mapa'), pagina = Math.floor((sit.dia - 1) / PEDRAS.length);
    mapa.querySelectorAll('.node').forEach(n => n.remove());
    PEDRAS.forEach(([x, y], i) => {
      const dia = pagina * PEDRAS.length + i + 1, feito = estado.concluidos.find(c => c.dia === dia);
      const hoje = sit.modo === 'jogar' && dia === sit.dia;
      const n = document.createElement('span');
      n.className = 'node ' + (feito ? 'done' : hoje ? 'today' : 'locked');
      n.style.left = (x / 1143 * 100).toFixed(1) + '%'; n.style.top = (y / 2000 * 100).toFixed(1) + '%';
      n.setAttribute('aria-label', `Dia ${dia}: ${feito ? 'concluído' : hoje ? 'hoje' : 'fechado'}`);
      n.textContent = feito || hoje ? dia : '🔒';
      if (feito) { const s = document.createElement('span'); s.className = 'node-stars'; s.textContent = '★'.repeat(feito.estrelas.total); n.append(s); }
      mapa.append(n);
    });
    const jogar = $('#jogar');
    jogar.disabled = sit.modo === 'amanha';
    jogar.innerHTML = sit.modo === 'amanha' ? 'Até amanhã <span aria-hidden="true">🌙</span>' : 'Jogar <span aria-hidden="true">▶</span>';
    const rolar = $('.trail-scroll'), img = mapa.querySelector('img');
    const descer = () => { const alvo = mapa.querySelector('.today') || [...mapa.querySelectorAll('.done')].pop(); rolar.scrollTop = alvo ? alvo.offsetTop - rolar.clientHeight * .6 : rolar.scrollHeight; };
    img.complete ? descer() : img.addEventListener('load', descer, { once: true });
  }

  // ---------- partida ----------
  const tela = $('#tela-partida'), tabuleiro = $('#tabuleiro');
  const paleta = [...document.querySelectorAll('#paleta button:not(.eraser)')];
  let jogo = null; // { dia, n, indice, pistas, solucao, vals, erros, cor, sel, feitas, moedas, inicio, gastoMs, desde, fimMs }

  const peca = k => tela.querySelector(`template[data-set="${tela.dataset.set}"][data-k="${k}"]`).content.cloneNode(true);
  const resolvido = () => jogo.vals.every((v, i) => v === jogo.solucao[i]);

  function comecarPartida() {
    let estado = ler();
    const sit = L.situacao(estado, L.dataLocal());
    if (sit.modo !== 'jogar') return desenharTrilha();
    if (!estado.pacote || estado.pacote.dia !== sit.dia) { estado = L.pegarPacote(estado, sit.dia, JOGOS.length); salvar(estado); }
    const n = estado.pacote.partidas.length + 1, indice = estado.pacote.jogos[n - 1], j = JOGOS[indice];
    jogo = { dia: sit.dia, n, indice, pistas: j.puzzle.slice(), solucao: j.solution.slice(), vals: j.puzzle.slice(), erros: 0, cor: null, sel: null, feitas: new Set(), moedas: 0, inicio: new Date().toISOString(), gastoMs: 0, desde: null, fimMs: null };
    tela.dataset.set = L.estiloDoJogo(sit.dia, n);
    $('#nome-estilo').textContent = NOMES[tela.dataset.set];
    $('#selo').replaceChildren(peca(1));
    $('#amigo').replaceChildren(peca(2));
    const placa = $('#placa'); placa.classList.remove('balanca'); void placa.offsetWidth; placa.classList.add('balanca');
    paleta.forEach((b, k) => { b.replaceChildren(peca(k)); b.firstElementChild.classList.replace('piece', 'pal-piece'); b.setAttribute('aria-pressed', 'false'); });
    tela.querySelector('.chest-coins').style.setProperty('--h', '0px');
    // Sementinhas no lugar do "1/6": douradas as feitas, pulsando a atual.
    $('#etapa').replaceChildren(...Array.from({ length: L.JOGOS_POR_DIA }, (_, k) => { const li = document.createElement('li'); if (k < n - 1) li.className = 'feita'; if (k === n - 1) li.className = 'agora'; return li; }));
    $('#etapa').setAttribute('aria-label', `Jogo ${n} de ${L.JOGOS_POR_DIA}`);
    mostrar('tela-partida');
    pintar();
    retomar();
  }

  // Tempo: corre só com o tabuleiro visível; para na última casa certa.
  function retomar() { if (jogo && jogo.fimMs === null && jogo.desde === null && tela.classList.contains('active') && !document.hidden) jogo.desde = performance.now(); }
  function pausar() { if (jogo && jogo.desde !== null) { jogo.gastoMs += performance.now() - jogo.desde; jogo.desde = null; } }
  document.addEventListener('visibilitychange', () => document.hidden ? pausar() : retomar());

  function pintar(nova) {
    tabuleiro.replaceChildren();
    jogo.vals.forEach((v, i) => {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'cell'; c.setAttribute('role', 'gridcell'); c.style.setProperty('--i', i);
      if (v === -1) c.classList.add('empty'); else c.append(peca(v));
      if (jogo.pistas[i] !== -1) c.disabled = true;
      if (i === jogo.sel) c.classList.add('selected');
      if (i === nova) c.classList.add('new');
      if (jogo.pistas[i] === -1 && v !== -1 && v !== jogo.solucao[i]) c.classList.add('mistake');
      c.addEventListener('click', () => colocar(i));
      tabuleiro.append(c);
    });
  }

  function solta(classe, texto, casa) {
    const s = document.createElement('span');
    s.className = classe; s.textContent = texto;
    s.style.left = casa.offsetLeft + casa.offsetWidth / 2 + 'px'; s.style.top = casa.offsetTop + 'px';
    tabuleiro.parentElement.append(s); setTimeout(() => s.remove(), 1000);
  }
  const NOTAS = [523, 659, 784, 988];
  const NOMES = { frutas: 'Feirinha de frutas', bichos: 'Amigos da trilha', tesouros: 'Caça ao tesouro', dinos: 'Ovos de dinossauro', carinhas: 'Bolinhas cantoras' };
  // Theo no palco: pula nas linhas completas, balança no erro, festeja no fim.
  function theo(reacao) { ['#theo', '#amigo'].forEach(id => { const t = $(id); t.classList.remove('yay', 'oops', 'festa'); void t.offsetWidth; t.classList.add(reacao); }); }

  function colocar(i) {
    if (jogo.terminado || jogo.pistas[i] !== -1 || jogo.cor === null) return;
    const antes = jogo.vals[i];
    jogo.sel = i; jogo.vals[i] = jogo.cor; pintar(i);
    const estilo = tela.dataset.set;
    if (jogo.vals[i] !== jogo.solucao[i]) {
      if (antes !== jogo.cor) jogo.erros++; // cada cor errada colocada conta um erro
      vibrar([65, 30, 65]); theo('oops'); return;
    }
    if (estilo === 'carinhas') tom(NOTAS[jogo.cor]);
    UNIDADES.forEach((u, ui) => {
      if (jogo.feitas.has(ui) || !u.every(k => jogo.vals[k] === jogo.solucao[k])) return;
      jogo.feitas.add(ui);
      u.forEach(k => tabuleiro.children[k].classList.add('unit-complete'));
      theo('yay');
      if (estilo === 'bichos') u.forEach(k => solta('heart-pop', '❤', tabuleiro.children[k]));
      if (estilo === 'carinhas') u.forEach((k, j) => { tom(NOTAS[jogo.vals[k]], .12 * j, .3); solta('note-pop', '♪', tabuleiro.children[k]); });
      if (estilo === 'tesouros') voarMoeda(tabuleiro.children[u[0]]);
    });
    if (resolvido() && jogo.fimMs === null) { pausar(); jogo.fimMs = jogo.gastoMs; completar(); }
  }

  // Tabuleiro certo: peças pulam em onda, brilho e estrelinhas; depois abre o próximo jogo.
  const PAUSA_ENTRE_JOGOS_MS = 1600;
  function completar() {
    jogo.terminado = true;
    setTimeout(() => {
      tabuleiro.classList.add('complete');
      theo('festa');
      [...tabuleiro.children].forEach((c, i) => { if (i % 3 === 0) solta('star-pop', '✦', c); });
      [784, 988, 1175].forEach((f, i) => tom(f, i * .1, .3, .15));
      vibrar(40);
    }, 450);
    setTimeout(fecharJogo, PAUSA_ENTRE_JOGOS_MS);
  }

  function voarMoeda(casa) {
    const bau = tela.querySelector('.chest'), de = casa.getBoundingClientRect(), para = bau.getBoundingClientRect();
    const m = document.createElement('i');
    m.className = 'fly-coin'; m.style.left = de.left + de.width / 2 - 11 + 'px'; m.style.top = de.top + 'px';
    document.body.append(m);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      m.style.transform = `translate(${para.left + para.width / 2 - de.left - de.width / 2}px,${para.top + 20 - de.top}px) scale(.6)`;
      m.style.opacity = '0';
    }));
    setTimeout(() => {
      m.remove(); jogo.moedas++;
      bau.querySelector('.chest-coins').style.setProperty('--h', Math.min(jogo.moedas * 2.2, 18) + 'px');
      bau.classList.remove('got'); void bau.offsetWidth; bau.classList.add('got');
    }, 820);
  }

  paleta.forEach((b, k) => b.addEventListener('click', () => {
    jogo.cor = k;
    paleta.forEach((x, j) => x.setAttribute('aria-pressed', String(k === j)));
    if (tela.dataset.set === 'carinhas') tom(NOTAS[k]);
  }));
  $('#borracha').addEventListener('click', () => {
    if (jogo.terminado || jogo.sel === null || jogo.pistas[jogo.sel] !== -1) return;
    jogo.vals[jogo.sel] = -1; pintar();
  });

  function fecharJogo() {
    tabuleiro.classList.remove('complete');
    const estado = ler();
    estado.pacote.partidas.push({ partida: jogo.n, desafio: jogo.indice + 1, estilo: tela.dataset.set, inicio: jogo.inicio, fim: new Date().toISOString(), duracaoMs: Math.round(jogo.fimMs), erros: jogo.erros });
    const avisar = () => document.dispatchEvent(new Event('partida-salva')); // nuvem envia ao pai
    if (estado.pacote.partidas.length < L.JOGOS_POR_DIA) { salvar(estado); avisar(); return comecarPartida(); }
    const { partidas, dia } = estado.pacote;
    const est = L.estrelas(partidas);
    estado.concluidos.push({ dia, data: L.dataLocal(), estrelas: est, partidas });
    estado.pacote = null;
    salvar(estado);
    avisar();
    jogo = null;
    vitoria(est, partidas);
  }

  // ---------- vitória ----------
  function vitoria(est, partidas) {
    mostrar('tela-vitoria');
    const tv = $('#tela-vitoria'), fx = tv.querySelector('.fx');
    [...$('#estrelas').children].forEach((s, i) => s.classList.toggle('off', i >= est.total));
    $('#estrelas').setAttribute('aria-label', `${est.total} de 3 estrelas`);
    const estilos = [...new Set(partidas.map(p => p.estilo))];
    $('#premios').replaceChildren(...estilos.map((e, i) => {
      const p = document.createElement('span'); p.className = 'prize'; p.style.setProperty('--i', i);
      const t = tela.querySelector(`template[data-set="${e}"][data-k="${i % 4}"]`).content.cloneNode(true);
      p.append(t); return p;
    }));
    tv.classList.remove('party'); void tv.offsetWidth; tv.classList.add('party');
    fx.replaceChildren();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cores = ['#087bf5', '#ffc400', '#19c83d', '#b515e5', '#ff6941'], r = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 70; i++) { const c = document.createElement('i'); c.className = 'confetti'; c.style.cssText = `left:${r(0,100)}%;background:${cores[i%5]};--d:${r(2.2,3.6)}s;--w:${r(0,1.6)}s;--x:${r(-60,60)}px;--r:${r(360,1080)}deg`; fx.append(c); }
    [[25,22,.2],[75,18,.6],[50,12,1.1],[20,40,1.6],[80,38,2]].forEach(([x, y, w], k) => { for (let i = 0; i < 14; i++) { const b = document.createElement('i'), a = i / 14 * Math.PI * 2, d = r(45, 70); b.className = 'burst'; b.style.cssText = `left:${x}%;top:${y}%;--c:${cores[(k+i)%4]};--w:${w}s;--x:${Math.cos(a)*d}px;--y:${Math.sin(a)*d}px`; fx.append(b); } });
    for (let i = 0; i < 16; i++) { const c = document.createElement('i'); c.className = 'coin'; c.style.cssText = `--w:${.4+i*.12}s;--x:${r(-120,140)}px;--y:${r(-260,-140)}px`; fx.append(c); }
    vibrar([90, 60, 90, 60, 250]);
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tom(f, .15 + i * .14 + (i > 3 ? .1 : 0), i === 5 ? .7 : .25, .18));
  }
  $('#ate-amanha').addEventListener('click', abrirRecados);

  // ---------- recados ----------
  let pararGravacao = null;
  async function abrirRecados() {
    mostrar('tela-recado');
    $('#recado-ouvido').hidden = true;
    $('#barra').style.width = '0';
    $('#contagem').textContent = '';
    $('#microfone').hidden = $('#microfone-texto').hidden = !window.Recados.podeGravar();
    $('#microfone-texto').textContent = 'Gravar para o papai';
    let recado = null;
    try { [recado] = await window.Recados.deQuem('pai'); } catch { /* sem armazenamento de áudio */ }
    $('#recado-pai').hidden = !recado;
    $('#ouvir').onclick = () => recado && window.Recados.tocar(recado, {
      aoProgresso: p => { $('#barra').style.width = p * 100 + '%'; },
      aoContar: s => { $('#contagem').textContent = s; $('#contagem').style.setProperty('--p', (10 - s) * 10 + '%'); },
      aoApagar: () => { $('#recado-pai').hidden = true; $('#recado-ouvido').hidden = false; }
    });
  }
  $('#microfone').addEventListener('click', async () => {
    const mic = $('#microfone'), txt = $('#microfone-texto');
    if (pararGravacao) { await pararGravacao(); pararGravacao = null; mic.classList.remove('rec'); txt.textContent = 'Guardado ✓'; return; }
    try { pararGravacao = await window.Recados.gravar('theo'); mic.classList.add('rec'); txt.textContent = 'Gravando… toque para parar'; }
    catch { txt.textContent = 'Microfone indisponível'; }
  });
  $('#voltar-trilha').addEventListener('click', () => { desenharTrilha(); mostrar('tela-trilha'); });

  $('#jogar').addEventListener('click', comecarPartida);
  if (!Array.isArray(JOGOS) || JOGOS.length !== 120) { $('#jogar').disabled = true; $('#jogar').textContent = 'Jogos não carregados'; }
  else desenharTrilha();
})();
