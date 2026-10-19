// Prueft, ob der Kaeufer eine Bewertung fuer die Auktion abgeben darf
export function canLeaveReview(auction: any): boolean {
  if (!auction) return false;
  return auction.review_enabled === true || auction.buyer_received === true;
}
