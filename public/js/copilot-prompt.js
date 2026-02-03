// public/js/copilot-prompt.js
(() => {
  const showBtn = document.getElementById('show-copilot-prompt');
  const flowDiv = document.getElementById('copilot-prompt-flow');
  const form = document.getElementById('copilot-prompt-form');
  const emailInput = document.getElementById('copilot-email');
  const notesInput = document.getElementById('copilot-notes');
  const expiresInput = document.getElementById('copilot-expires');
  const resultDiv = document.getElementById('copilot-prompt-result');
  const commandEl = document.getElementById('copilot-prompt-command');

  if (!showBtn || !flowDiv || !form || !emailInput || !commandEl) return;

  showBtn.addEventListener('click', () => {
    flowDiv.classList.toggle('is-hidden');
    resultDiv.classList.add('is-hidden');
    form.reset();
    commandEl.textContent = '';
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = (emailInput.value || '').trim().toLowerCase();
    const notes = (notesInput.value || '').trim();
    const expires = (expiresInput.value || '').trim();
    // Detect environment
    let baseUrl = window.location.origin;
    if (baseUrl.includes('localhost')) {
      baseUrl = 'http://localhost:8787';
    } else if (baseUrl.includes('preview')) {
      baseUrl = 'https://grassmvtsurvey-preview.anchorskov.workers.dev';
    } else {
      baseUrl = 'https://grassmvtsurvey.anchorskov.workers.dev';
    }
    let cmd = `VERIFY_VOTER_BASE_URL=${baseUrl} node scripts/admin_issue_verify_voter_link.mjs --email ${email}`;
    if (notes) cmd += ` --notes "${notes.replace(/"/g, '\"')}"`;
    if (expires && Number(expires) > 0) cmd += ` --expires ${expires}`;
    cmd += ' --session <session-id>';
    commandEl.textContent = cmd;
    resultDiv.classList.remove('is-hidden');
  });
})();