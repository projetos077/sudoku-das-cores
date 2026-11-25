// Regras do dia, da fila de jogos, dos estilos e das estrelas (sem tela).
(function (raiz) {
  'use strict';

  // Ajustar com os dados reais (README, "Regra das estrelas").
  const LIMITE_ERROS = 6;
  const LIMITE_MEDIA_MS = 2 * 60 * 1000;
  const JOGOS_POR_DIA = 6;
  const ESTILOS = ['frutas', 'bichos', 'tesouros', 'dinos', 'carinhas'];

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

  // Estilo do jogo: a ordem gira a cada dia; com 6 jogos e 5 estilos o sexto repete.
  const estiloDoJogo = (dia, jogo) => ESTILOS[((dia - 1) * JOGOS_POR_DIA + (jogo - 1)) % ESTILOS.length];

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

  const Logica = { LIMITE_ERROS, LIMITE_MEDIA_MS, JOGOS_POR_DIA, ESTILOS, dataLocal, estadoInicial, situacao, estiloDoJogo, pegarPacote, estrelas };
  if (typeof module !== 'undefined') module.exports = Logica;
  else raiz.Logica = Logica;
})(this);
