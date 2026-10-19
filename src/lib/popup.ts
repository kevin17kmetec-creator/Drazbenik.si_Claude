export const openCenteredPopup = (url: string, name: string, width: number, height: number): Window | null => {
  // Pruefung auf mobile Geraete oder kleine Bildschirme (kein Popup)
  if (window.innerWidth < 768 || ('ontouchstart' in window)) {
    return window.open(url, name);
  }

  // Berechne Zentrierung relativ zum aktuellen Fenster/Monitor
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  // Begrenzung auf den verfuegbaren Bildschirmbereich
  const w = Math.min(width, window.screen.availWidth - 40);
  const h = Math.min(height, window.screen.availHeight - 40);
  const x = Math.max(window.screenX, left);
  const y = Math.max(window.screenY, top);

  const features = `popup=yes,width=${w},height=${h},left=${x},top=${y},resizable=yes,scrollbars=yes`;
  
  return window.open(url, name, features);
};
