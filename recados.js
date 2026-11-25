// Recados de áudio entre pai e criança.
// ponytail: guarda só neste aparelho (IndexedDB); a entrega entre celulares precisa do serviço de rede.
(function () {
  'use strict';
  const APAGAR_APOS_OUVIR_MS = 15000;

  const abrir = () => new Promise((ok, erro) => {
    const req = indexedDB.open('sudoku-theo-recados', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('recados', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
  const operar = (modo, fn) => abrir().then(db => new Promise((ok, erro) => {
    const tx = db.transaction('recados', modo);
    const req = fn(tx.objectStore('recados'));
    tx.oncomplete = () => ok(req && req.result);
    tx.onerror = () => erro(tx.error);
  }));

  const guardar = (de, blob) => operar('readwrite', s => s.add({ de, blob, criado: Date.now() }));
  const apagar = id => operar('readwrite', s => s.delete(id));
  const deQuem = de => operar('readonly', s => s.getAll()).then(todos => todos.filter(r => r.de === de));

  // Toca o recado; ao terminar, conta 15 s (dá para ouvir de novo) e apaga.
  function tocar(recado, { aoProgresso, aoContar, aoApagar }) {
    const audio = new Audio(URL.createObjectURL(recado.blob));
    let relogio = null;
    audio.ontimeupdate = () => audio.duration && aoProgresso(audio.currentTime / audio.duration);
    audio.onended = () => {
      if (relogio) return;
      operar('readwrite', s => s.put({ ...recado, ouvido_em: Date.now() })); // quem mandou vê "ouviu"
      const fim = Date.now() + APAGAR_APOS_OUVIR_MS;
      relogio = setInterval(async () => {
        const resta = Math.max(0, Math.ceil((fim - Date.now()) / 1000));
        aoContar(resta);
        if (resta === 0) { clearInterval(relogio); URL.revokeObjectURL(audio.src); await apagar(recado.id); aoApagar(); }
      }, 250);
    };
    audio.play();
    return audio;
  }

  // Grava enquanto ativo; devolve uma função que para e entrega o áudio (Blob). Enviar é outro passo.
  async function gravar() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream), partes = [];
    rec.ondataavailable = e => partes.push(e.data);
    rec.start();
    return () => new Promise(ok => {
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); ok(new Blob(partes, { type: rec.mimeType })); };
      rec.stop();
    });
  }

  // Recado enviado: 'enviado' (ainda não ouvido) ou 'ouvido' (ouvido, ou já apagado depois de ouvido).
  const enviar = (de, blob) => guardar(de, blob); // devolve o id
  const situacao = id => operar('readonly', s => s.get(id)).then(r => (r && !r.ouvido_em ? 'enviado' : 'ouvido'));

  const podeGravar = () => !!(navigator.mediaDevices && window.MediaRecorder);
  window.Recados = { deQuem, tocar, gravar, enviar, situacao, podeGravar, APAGAR_APOS_OUVIR_MS };
})();
