export function createWhatsAppMessageUrl(phone: string | undefined, message: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const internationalNumber = digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${internationalNumber}?text=${encodeURIComponent(message)}`;
}
