// Regras do dia, da fila de jogos, dos estilos e das estrelas (sem tela).
(function (raiz) {
  'use strict';

  // Ajustar com os dados reais (README, "Regra das estrelas").
  const LIMITE_ERROS = 6;
  const LIMITE_MEDIA_MS = 2 * 60 * 1000;
  const JOGOS_POR_DIA = 6;
  const AVISO_ERROS_JOGO = 2; // mais que isto num jogo: bolinha laranja no calendário do pai
  const ESTILOS = ['frutas', 'bichos', 'tesouros', 'dinos', 'carinhas', 'brinquedos'];

  const dataLocal = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const estadoInicial = () => ({ concluidos: [], pacote: null, fila: [], posicao: 0 });

  // Um nó por data: depois de concluir, o próximo só abre em outra data.
  function situacao(estado, hoje) {
    const ultimo = estado.concluidos[estado.concluidos.length - 1];
    const dia = estado.concluidos.length + 1;
    if (ultimo && ultimo.data === hoje) return { modo: 'amanha', dia: ultimo.dia };
    return { modo: 'jogar', dia };
  }

  // Estilo do jogo: os 6 jogos do dia usam os 6 estilos, todos diferentes; a ordem gira a cada dia.
  const estiloDoJogo = (dia, jogo) => ESTILOS[(dia - 1 + jogo - 1) % ESTILOS.length];

  function embaralhar(lista, aleatorio = Math.random) {
    const copia = lista.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  // Seis jogos da coleção, sem repetir dentro de cada ciclo de 120.
  function pegarPacote(estado, dia, total, aleatorio = Math.random) {
    let { fila, posicao } = estado;
    const jogos = [];
    while (jogos.length < JOGOS_POR_DIA) {
      if (!Array.isArray(fila) || fila.length !== total || posicao >= fila.length) {
        fila = embaralhar([...Array(total).keys()], aleatorio);
        posicao = 0;
      }
      jogos.push(fila[posicao++]);
    }
    return { ...estado, fila, posicao, pacote: { dia, jogos, partidas: [] } };
  }

  // Concluir vem sempre; Atenção: até 6 erros no dia; Rapidez: média de até 2 min.
  function estrelas(partidas) {
    const erros = partidas.reduce((s, p) => s + p.erros, 0);
    const mediaMs = partidas.reduce((s, p) => s + p.duracaoMs, 0) / partidas.length;
    const atencao = erros <= LIMITE_ERROS;
    const rapidez = mediaMs <= LIMITE_MEDIA_MS;
    return { total: 1 + atencao + rapidez, atencao, rapidez, erros, mediaMs };
  }

  // Pai reinicia a partir do dia N: apaga o dia N e os seguintes; a criança joga o dia N de novo, já hoje.
  const reiniciar = (estado, dia) => ({
    ...estado,
    concluidos: estado.concluidos.filter(c => c.dia < dia),
    pacote: estado.pacote && estado.pacote.dia >= dia ? null : estado.pacote,
  });

  // Estrelas de um jogo só (painel do pai): concluir + poucos erros (limite do dia dividido pelos jogos) + rapidez.
  const estrelasJogo = j => 1 + (j.erros <= LIMITE_ERROS / JOGOS_POR_DIA) + (j.duracaoMs <= LIMITE_MEDIA_MS);

  // Calendário do pai. jogos: [{fim, duracaoMs, erros, ...}]; dias: [{fim, estrelas}] (dia concluído = 6 jogos).
  // Verde: dia concluído. Amarelo: jogou e não concluiu. Cinza: passado sem jogar (depois do 1º dia de uso).
  const dataDe = iso => dataLocal(new Date(iso));
  function mapaDias(jogos, dias) {
    const m = {};
    const dia = d => (m[d] ||= { estado: 'amarelo', jogos: [], aviso: false, estrelas: 0 });
    jogos.forEach(j => { const o = dia(dataDe(j.fim)); o.jogos.push(j); if (j.erros > AVISO_ERROS_JOGO) o.aviso = true; });
    dias.forEach(d => { const o = dia(dataDe(d.fim)); o.estado = 'verde'; o.estrelas = d.estrelas; });
    return m;
  }
  function estadoDoDia(mapa, data, hoje) {
    if (mapa[data]) return mapa[data].estado;
    const primeira = Object.keys(mapa).sort()[0];
    return primeira && data > primeira && data < hoje ? 'cinza' : 'vazio'; // futuro e antes do 1º uso: sem cor
  }
  // Dias verdes seguidos até hoje (se hoje ainda não é verde, conta a partir de ontem).
  function sequenciaVerde(mapa, hoje) {
    const d = new Date(hoje + 'T12:00:00');
    if (!(mapa[hoje] && mapa[hoje].estado === 'verde')) d.setDate(d.getDate() - 1);
    let n = 0;
    while (mapa[dataLocal(d)] && mapa[dataLocal(d)].estado === 'verde') { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  const Logica = { LIMITE_ERROS, LIMITE_MEDIA_MS, JOGOS_POR_DIA, AVISO_ERROS_JOGO, ESTILOS, dataLocal, dataDe, estadoInicial, situacao, estiloDoJogo, pegarPacote, reiniciar, estrelas, estrelasJogo, mapaDias, estadoDoDia, sequenciaVerde };
  if (typeof module !== 'undefined') module.exports = Logica;
  else raiz.Logica = Logica;
})(this);
