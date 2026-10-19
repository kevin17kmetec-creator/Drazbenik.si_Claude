// Deutscher Kommentar: Gemeinsame Gebotsschritt-Tabelle fuer Client und Server (eine einzige Quelle der Wahrheit)
export const getIncrement = (amount: number): number => {
  if (amount < 10) return 1;
  if (amount < 50) return 2;
  if (amount < 200) return 5;
  if (amount < 500) return 10;
  return 20;
};
