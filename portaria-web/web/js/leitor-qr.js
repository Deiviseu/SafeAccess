function criarLeitorQr(video, aoLer) {
  let stream = null, timer = null, detector = null, ativo = false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const LARGURA_MAX = 800; // reduz a imagem: mais rápido em computador simples

  async function prepararDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const formatos = await window.BarcodeDetector.getSupportedFormats();
      return formatos.includes('qr_code') ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    } catch {
      return null;
    }
  }

  async function decodificar() {
    if (detector) {
      const achados = await detector.detect(video);
      return achados.length ? achados[0].rawValue : null;
    }
    const escala = Math.min(1, LARGURA_MAX / video.videoWidth);
    const w = Math.round(video.videoWidth * escala), h = Math.round(video.videoHeight * escala);
    if (!w || !h) return null;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  }

  async function ciclo() {
    if (!ativo) return;
    if (video.readyState >= 2) {
      try {
        const valor = await decodificar();
        if (valor) await aoLer(valor);
      } catch (e) {
        console.warn('Falha ao ler o quadro da câmera:', e);
      }
    }
    if (ativo) timer = setTimeout(ciclo, 200);
  }

  return {
    get motor() { return detector ? 'nativo' : 'jsQR'; },
    get ativo() { return ativo; },

    async iniciar() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const e = new Error('Câmera indisponível'); e.name = 'InsecureContext'; throw e;
      }
      detector = await prepararDetector();
      if (!detector && typeof window.jsQR !== 'function') throw new Error('Biblioteca de leitura de QR não carregada.');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const { facingMode } = stream.getVideoTracks()[0].getSettings();
      video.classList.toggle('espelhado', facingMode !== 'environment');
      video.srcObject = stream;
      await video.play();
      ativo = true;
      ciclo();
    },

    parar() {
      ativo = false;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
      video.srcObject = null;
    },
  };
}
