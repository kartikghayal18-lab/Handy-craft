let checkoutScriptPromise;

export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-memory-kraft-razorpay]');
    const script = existing || document.createElement('script');
    script.dataset.memoryKraftRazorpay = 'true';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay Checkout did not initialize.'));
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
    if (!existing) document.head.appendChild(script);
  }).catch(error => {
    checkoutScriptPromise = undefined;
    throw error;
  });
  return checkoutScriptPromise;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Secure checkout is temporarily unavailable.');
    error.code = data.code;
    throw error;
  }
  return data;
}

export const createPaymentOrder = payload => postJson('/api/razorpay/create-order', payload);
export const verifyPayment = payload => postJson('/api/razorpay/verify-payment', payload);
