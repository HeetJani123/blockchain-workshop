export function createInvoice() {
  return { id: `INV${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`, cents: 1 + Math.floor(Math.random() * 15), size: 24 + Math.floor(Math.random() * 1001) };
}
export function canAfford(price, budget, balance) { return price <= budget && price <= balance; }
export function settle(price, budget, balance) {
  if (!canAfford(price, budget, balance)) throw new Error('Payment exceeds agent limits');
  return balance - price;
}
export function dollars(cents) { return (cents / 100).toFixed(2); }
