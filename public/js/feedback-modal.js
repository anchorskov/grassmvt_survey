/* public/js/feedback-modal.js */
(function () {
  const MODAL_ID = 'feedback-modal';
  const MAX_CHARS = 2000;

  const getModal = () => document.getElementById(MODAL_ID);

  const open = () => {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    const textarea = document.getElementById('feedback-modal-message');
    if (textarea) setTimeout(() => textarea.focus(), 60);
  };

  const close = () => {
    const modal = getModal();
    if (!modal) return;
    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    // Reset form state
    const form = document.getElementById('feedback-modal-form');
    if (form) form.reset();
    const counter = document.getElementById('feedback-modal-counter');
    if (counter) counter.textContent = `0 / ${MAX_CHARS}`;
    const err = document.getElementById('feedback-modal-error');
    if (err) { err.textContent = ''; err.classList.add('is-hidden'); }
    const success = document.getElementById('feedback-modal-success');
    if (success) { success.textContent = ''; success.classList.add('is-hidden'); }
    const submitBtn = document.getElementById('feedback-modal-submit');
    if (submitBtn) submitBtn.disabled = false;
  };

  const init = () => {
    const modal = getModal();
    if (!modal) return;

    // Backdrop click and explicit close buttons
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-feedback-close]')) close();
    });

    // Keyboard close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('is-hidden')) close();
    });

    // Character counter
    const textarea = document.getElementById('feedback-modal-message');
    const counter = document.getElementById('feedback-modal-counter');
    if (textarea && counter) {
      textarea.addEventListener('input', () => {
        counter.textContent = `${textarea.value.length} / ${MAX_CHARS}`;
      });
    }

    // Open triggers — any element with [data-feedback-open]
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-feedback-open]')) open();
    });

    // Form submit
    const form = document.getElementById('feedback-modal-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = (document.getElementById('feedback-modal-message')?.value || '').trim();
      const email = (document.getElementById('feedback-modal-email')?.value || '').trim();
      const page = window.location.pathname;

      const err = document.getElementById('feedback-modal-error');
      const success = document.getElementById('feedback-modal-success');
      const submitBtn = document.getElementById('feedback-modal-submit');

      const showErr = (msg) => {
        if (err) { err.textContent = msg; err.classList.remove('is-hidden'); }
        if (success) success.classList.add('is-hidden');
      };

      if (!message || message.length < 5) {
        showErr('Please enter a message of at least 5 characters.');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (err) err.classList.add('is-hidden');
      if (success) success.classList.add('is-hidden');

      try {
        const resp = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message, email, page }),
        });
        const data = await resp.json();
        if (data.ok) {
          if (success) {
            success.textContent = 'Thanks — your feedback was sent.';
            success.classList.remove('is-hidden');
          }
          form.reset();
          if (counter) counter.textContent = `0 / ${MAX_CHARS}`;
          setTimeout(close, 2200);
        } else {
          showErr(data.message || 'Unable to send feedback. Please try again.');
          if (submitBtn) submitBtn.disabled = false;
        }
      } catch {
        showErr('A network error occurred. Please try again.');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
