const WORKSPACE = {
  key: "cryptoAlertIA.workspace",
  guardar(datos) { localStorage.setItem(this.key, JSON.stringify(datos)); },
  cargar() { try { return JSON.parse(localStorage.getItem(this.key)); } catch { return null; } }
};
