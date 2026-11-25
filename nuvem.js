// Ligação entre o celular da criança e o do pai (Supabase).
// Precisa antes: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// Também responde como window.Recados (mesma interface de recados.js), então o app.js não muda.
(function () {
  'use strict';
  const URL_SB = 'https://rrsnpcfpvwtfkomhcnxq.supabase.co';
  const CHAVE = 'sb_publishable_2Cz7vcO6WmRn5LwimC6m_Q_wRqTBBYg'; // pública por natureza; quem protege é o RLS
  const APAGAR_APOS_OUVIR_MS = 15000;

  // Simulador (?simulador): sem comunicação; recados e dados ficam neste navegador (recados.js).
  if (/[?&]simulador\b/.test(location.search)) { window.Nuvem = null; return; }

  // Sem internet o CDN não carrega: o jogo segue, só sem recados e sem envio.
  if (!window.supabase) {
    window.Nuvem = null;
    window.Recados = { deQuem: async () => [], situacao: async () => null, podeGravar: () => false, APAGAR_APOS_OUVIR_MS };
    return;
  }

  // Sessão separada por página: no simulador (mesmo navegador) pai e criança são aparelhos diferentes.
  const pagina = /pai\.html$/.test(location.pathname) ? 'pai' : 'crianca';
  const sb = window.supabase.createClient(URL_SB, CHAVE, { auth: { storageKey: `sb-theo-${pagina}` } });
  const papel = de => (de === 'theo' ? 'crianca' : de); // o app.js chama a criança de 'theo'
  let eu = null; // { familia_id, papel } ou null se o aparelho ainda não foi pareado

  async function iniciar() {
    let { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const r = await sb.auth.signInAnonymously();
      if (r.error) throw r.error;
      session = r.data.session;
    }
    const { data, error } = await sb.from('membros').select('familia_id, papel').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    eu = data;
    return eu;
  }

  // Pai: cria a família e recebe o código de 6 dígitos (vale 15 min, uso único).
  async function criarFamilia() {
    const { data, error } = await sb.rpc('criar_familia');
    if (error) throw error;
    await iniciar();
    return data;
  }
  async function novoCodigo() {
    const { data, error } = await sb.rpc('novo_codigo');
    if (error) throw error;
    return data;
  }
  // Pai: a criança já entrou?
  const criancaEntrou = async () => ((await sb.from('membros').select('papel').eq('papel', 'crianca')).data || []).length > 0;

  // Pai já ligado: código para ligar outro aparelho/login do pai. O aparelho novo entra com entrarComoPai.
  async function codigoPai() {
    const { data, error } = await sb.rpc('codigo_pai');
    if (error) throw error;
    return data;
  }
  async function entrarComoPai(codigo) {
    const { data, error } = await sb.rpc('entrar_como_pai', { p_codigo: String(codigo).trim() });
    if (error) throw error;
    if (data) await iniciar();
    return data;
  }

  // Criança: digita o código mostrado no celular do pai. Devolve true/false.
  async function entrarFamilia(codigo) {
    const { data, error } = await sb.rpc('entrar_familia', { p_codigo: String(codigo).trim() });
    if (error) throw error;
    if (data) await iniciar();
    return data;
  }

  // Criança: manda tudo o que está salvo no aparelho. Repetir não duplica (upsert ignora o que já existe),
  // então dá para chamar sempre: ao abrir, ao voltar a internet e a cada partida.
  async function sincronizar(estado) {
    if (!eu || eu.papel !== 'crianca') return;
    const f = eu.familia_id;
    const lote = [...estado.concluidos, ...(estado.pacote ? [estado.pacote] : [])];
    const partidas = lote.flatMap(d => d.partidas.map(p => ({ familia_id: f, etapa: d.dia, ordem: p.partida, tempo_ms: p.duracaoMs, erros: p.erros, criada_em: p.fim })));
    const dias = estado.concluidos.map(d => ({ familia_id: f, etapa: d.dia, estrelas: d.estrelas.total, concluido_em: d.partidas[d.partidas.length - 1].fim }));
    if (partidas.length) {
      const { error } = await sb.from('partidas').upsert(partidas, { onConflict: 'familia_id,etapa,ordem', ignoreDuplicates: true });
      if (error) throw error;
    }
    if (dias.length) {
      const { error } = await sb.from('dias').upsert(dias, { onConflict: 'familia_id,etapa', ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  // Pai reinicia a partir de um dia: o servidor apaga os dados e marca o reinício para o celular do Theo.
  async function reiniciarDia(etapa) {
    const { error } = await sb.rpc('reiniciar_dia', { p_etapa: etapa });
    if (error) throw error;
  }
  // Criança: último reinício pedido pelo pai ({ etapa, em }); o app aplica se ainda não aplicou este.
  async function reinicio() {
    const { data, error } = await sb.from('familias').select('reinicio_etapa, reinicio_em').maybeSingle();
    if (error) throw error;
    return data && data.reinicio_em ? { etapa: data.reinicio_etapa, em: data.reinicio_em } : null;
  }

  // Pai: painel.
  const lerPartidas = async () => (await sb.from('partidas').select('*').order('etapa').order('ordem')).data || [];
  const lerDias = async () => (await sb.from('dias').select('*').order('etapa')).data || [];

  // Recados ------------------------------------------------------------
  const deQuem = async de => (eu ? (await sb.from('recados').select('*').eq('de', papel(de)).order('criado_em')).data || [] : []);

  // Toca o recado; ao terminar, marca como ouvido, conta 15 s (dá para ouvir de novo) e apaga.
  // O servidor também apaga sozinho (função limpar-recados), caso o app feche antes.
  // iPhone/Safari só deixa tocar dentro do toque do usuário: damos play() já, num silêncio, e só depois trocamos pelo áudio.
  const SILENCIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  function tocar(recado, { aoProgresso, aoContar, aoApagar, aoErro = () => {} }) {
    const audio = new Audio(SILENCIO);
    let relogio = null;
    audio.play().catch(() => {});
    sb.storage.from('recados').createSignedUrl(recado.caminho, 60).then(({ data }) => {
      if (!data) return aoApagar(); // já foi apagado
      audio.src = data.signedUrl;
      return audio.play().catch(aoErro);
    }).catch(aoErro);
    audio.onerror = () => { if (audio.src !== SILENCIO && !audio.src.startsWith('data:')) aoErro(); };
    audio.ontimeupdate = () => audio.duration && aoProgresso(audio.currentTime / audio.duration);
    audio.onended = async () => {
      if (relogio || audio.src.startsWith('data:')) return; // o fim do silêncio não conta como ouvido
      relogio = true;
      await sb.rpc('marcar_ouvido', { p_id: recado.id }); // o supabase-js só envia com await
      const fim = Date.now() + APAGAR_APOS_OUVIR_MS;
      relogio = setInterval(async () => {
        const resta = Math.max(0, Math.ceil((fim - Date.now()) / 1000));
        aoContar(resta);
        if (resta === 0) {
          clearInterval(relogio);
          await sb.storage.from('recados').remove([recado.caminho]);
          await sb.from('recados').delete().eq('id', recado.id);
          aoApagar();
        }
      }, 250);
    };
    return audio;
  }

  // iPhone só grava audio/mp4; o Chrome do S23 também aceita. Assim um toca o do outro.
  const formato = () => ['audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';

  // Grava; devolve uma função que para e entrega o áudio (Blob). Enviar é outro passo.
  async function gravar() {
    if (!eu) throw new Error('aparelho não pareado');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tipo = formato();
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : {}), partes = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) partes.push(e.data); };
    rec.start();
    return () => new Promise((ok, erro) => {
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const mime = (rec.mimeType || tipo || 'audio/mp4').split(';')[0];
        partes.length ? ok(new Blob(partes, { type: mime })) : erro(new Error('gravação vazia'));
      };
      rec.stop();
    });
  }

  // Sobe o áudio e cria o recado; devolve o id.
  async function enviar(de, blob) {
    if (!eu) throw new Error('aparelho não pareado');
    const mime = (blob.type || 'audio/mp4').split(';')[0];
    const caminho = `${eu.familia_id}/${crypto.randomUUID()}.${mime === 'audio/webm' ? 'webm' : 'm4a'}`;
    const up = await sb.storage.from('recados').upload(caminho, blob, { contentType: mime });
    if (up.error) throw up.error;
    const { data, error } = await sb.from('recados').insert({ familia_id: eu.familia_id, de: papel(de), caminho }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  // Recado enviado: 'enviado' (ainda não ouvido) ou 'ouvido' (ouvido, ou já apagado depois de ouvido).
  async function situacao(id) {
    const { data, error } = await sb.from('recados').select('ouvido_em').eq('id', id).maybeSingle();
    if (error) throw error;
    return data && !data.ouvido_em ? 'enviado' : 'ouvido';
  }

  const podeGravar = () => !!(eu && navigator.mediaDevices && window.MediaRecorder);

  // Avisa na hora (app aberto) quando chega recado ou dado novo. Devolve função para parar.
  function ouvir(aoMudar) {
    const canal = sb.channel('familia')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recados' }, aoMudar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'partidas' }, aoMudar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dias' }, aoMudar)
      .subscribe();
    return () => sb.removeChannel(canal);
  }

  // Avisos com o app fechado (Web Push). No iPhone só existe com o app aberto pela Tela de Início.
  const podeAvisar = () => !!(eu && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  async function ativarAvisos(pedir = true) {
    if (!podeAvisar()) return false;
    if (Notification.permission !== 'granted' && (!pedir || await Notification.requestPermission() !== 'granted')) return false;
    const { data: chave, error: e1 } = await sb.rpc('chave_push');
    if (e1 || !chave) return false;
    const bytes = Uint8Array.from(atob(chave.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }));
    const j = sub.toJSON();
    const { error } = await sb.from('push_inscricoes').upsert({ endpoint: j.endpoint, familia_id: eu.familia_id, papel: eu.papel, p256dh: j.keys.p256dh, auth: j.keys.auth });
    if (error) throw error;
    return true;
  }

  window.Nuvem = {
    iniciar, quemSou: () => eu, criarFamilia, novoCodigo, criancaEntrou, entrarFamilia, codigoPai, entrarComoPai,
    sincronizar, lerPartidas, lerDias, ouvir, podeAvisar, ativarAvisos, reiniciarDia, reinicio,
  };
  window.Recados = { deQuem, tocar, gravar, enviar, situacao, podeGravar, APAGAR_APOS_OUVIR_MS };
})();
