export function createInvoice() {
  return { id: `INV${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`, cents: 1 + Math.floor(Math.random() * 15), size: 24 + Math.floor(Math.random() * 1001) };
}
export function canAfford(price, budget, balance, policy = 'balanced') {
  const mode = policy ?? 'balanced';
  const budgetLimit = mode === 'strict' ? budget * 0.8 : mode === 'generous' ? budget * 1.15 : budget;
  return price <= budgetLimit && price <= balance;
}
export function settle(price, budget, balance, policy = 'balanced') {
  if (!canAfford(price, budget, balance, policy)) throw new Error('Payment exceeds agent limits');
  return balance - price;
}
export function dollars(cents) { return (cents / 100).toFixed(2); }
