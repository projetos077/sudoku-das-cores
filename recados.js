// Recados de áudio entre pai e criança.
// ponytail: guarda só neste aparelho (IndexedDB); a entrega entre celulares precisa do serviço de rede.
(function () {
  'use strict';
  const APAGAR_APOS_OUVIR_MS = 10000;

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

  // Toca o recado; ao terminar, conta 10 s (dá para ouvir de novo) e apaga.
  function tocar(recado, { aoProgresso, aoContar, aoApagar }) {
    const audio = new Audio(URL.createObjectURL(recado.blob));
    let relogio = null;
    audio.ontimeupdate = () => audio.duration && aoProgresso(audio.currentTime / audio.duration);
    audio.onended = () => {
      if (relogio) return;
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

  // Grava enquanto ativo; devolve uma função que para e guarda.
  async function gravar(de) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream), partes = [];
    rec.ondataavailable = e => partes.push(e.data);
    rec.start();
    return () => new Promise(ok => {
      rec.onstop = async () => { stream.getTracks().forEach(t => t.stop()); await guardar(de, new Blob(partes, { type: rec.mimeType })); ok(); };
      rec.stop();
    });
  }

  const podeGravar = () => !!(navigator.mediaDevices && window.MediaRecorder);
  window.Recados = { deQuem, tocar, gravar, podeGravar };
})();
