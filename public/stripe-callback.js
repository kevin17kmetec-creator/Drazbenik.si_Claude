// Deutscher Kommentar: Ausgelagert, weil die CSP Inline-Skripte blockiert (sonst blieb das Popup ewig im Ladezustand)
    (async function() {
      const urlParams = new URLSearchParams(window.location.search);
      const payment = urlParams.get('payment');
      const stripe = urlParams.get('stripe');
      const verification = urlParams.get('verification');
      const sessionId = urlParams.get('session_id');
      const type = urlParams.get('type') || 'auction';

      const isCancel = payment === 'cancel' || stripe === 'cancel' || verification === 'cancel';
      const isSuccess = payment === 'success' || stripe === 'success' || verification === 'success' || !!sessionId;

      const titleEl = document.getElementById('title');
      const descEl = document.getElementById('description');
      const iconContainer = document.getElementById('iconContainer');
      const badgeEl = document.getElementById('badge');

      let action = 'checkout';
      if (stripe) action = 'stripe_connect';
      if (verification) action = 'verification';

      if (sessionId && !isCancel) {
        try {
          await fetch('/api/confirm-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId })
          });
        } catch (e) {
          console.warn('Confirmation fetch error:', e);
        }
      }

      if (isCancel) {
        iconContainer.className = 'icon-container icon-cancel';
        iconContainer.innerHTML = '✕';
        titleEl.textContent = 'Postopek preklican';
        descEl.textContent = 'Postopek je bil preklican. Zapiram okno in se vračam na platformo...';
        badgeEl.textContent = 'Preklicano';
      } else {
        iconContainer.className = 'icon-container icon-success';
        iconContainer.innerHTML = '✓';
        titleEl.textContent = action === 'stripe_connect' ? 'Stripe račun uspešno povezan!' : 'Plačilo uspešno izvedeno!';
        descEl.textContent = 'Podatki so osveženi. Zapiram to okno...';
        badgeEl.textContent = 'Uspešno zaključeno';
      }

      // Check if opened as a popup
      const isPopup = window.opener && !window.opener.closed;

      if (isPopup) {
        try {
          window.opener.postMessage({
            type: 'STRIPE_POPUP_CALLBACK',
            status: isCancel ? 'cancel' : 'success',
            action: action,
            sessionId: sessionId,
            payment: payment || (isSuccess ? 'success' : 'cancel')
          }, '*');
        } catch (err) {
          console.warn('PostMessage error:', err);
        }

        // Close the popup window automatically
        setTimeout(function() {
          try {
            window.close();
          } catch (e) {
            console.warn('Close window error:', e);
          }
        }, 800);
      } else {
        // Not a popup (e.g. opened in same tab): redirect back to relevant view on platform
        setTimeout(function() {
          if (action === 'stripe_connect') {
            window.location.href = '/nastavitve?stripe=success';
          } else if (type === 'subscription' || window.location.search.includes('type=subscription')) {
            window.location.href = '/narocnine?payment=success&type=subscription' + (sessionId ? '&session_id=' + encodeURIComponent(sessionId) : '');
          } else {
            window.location.href = '/moje-zmage?payment=success' + (sessionId ? '&session_id=' + encodeURIComponent(sessionId) : '');
          }
        }, 1200);
      }
    })();
