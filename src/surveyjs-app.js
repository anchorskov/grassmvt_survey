// src/surveyjs-app.js
/* src/surveyjs-app.js */
import { Model } from 'survey-core';
import { renderSurvey } from 'survey-js-ui';

const statusId = 'surveyjs-status';
const titleId = 'surveyjs-title';
const containerId = 'surveyjs-root';
const editingId = 'surveyjs-editing';
const authBannerId = 'survey-auth-banner';
const minStateSearchLength = 2;
const authReturnKey = 'auth_return_to';
const browseDraftKeyPrefix = 'surveyjs_browse_draft:';

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getSlugFromPath = () => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'surveys' || !parts[1]) {
    return '';
  }
  return decodeURIComponent(parts[1]);
};

const setStatus = (message) => {
  const status = document.getElementById(statusId);
  if (status) {
    status.textContent = message;
  }
};

const setEditingNotice = (message) => {
  const editing = document.getElementById(editingId);
  if (!editing) {
    return;
  }
  if (!message) {
    editing.textContent = '';
    editing.classList.add('is-hidden');
    return;
  }
  editing.textContent = message;
  editing.classList.remove('is-hidden');
};

const setTitle = (title) => {
  const titleEl = document.getElementById(titleId);
  if (titleEl) {
    titleEl.textContent = title;
  }
  if (title) {
    document.title = `${title} | Grassroots Movement`;
  }
};

const getBrowseDraftKey = (slug) => `${browseDraftKeyPrefix}${slug}`;

const readBrowseDraft = (slug) => {
  try {
    const raw = sessionStorage.getItem(getBrowseDraftKey(slug));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (!parsed.answersJson || typeof parsed.answersJson !== 'object') {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

const writeBrowseDraft = (slug, answersJson = {}) => {
  try {
    sessionStorage.setItem(
      getBrowseDraftKey(slug),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        answersJson,
      })
    );
  } catch (error) {
    // Ignore storage failures
  }
};

const clearBrowseDraft = (slug) => {
  try {
    sessionStorage.removeItem(getBrowseDraftKey(slug));
  } catch (error) {
    // Ignore storage failures
  }
};

const storeAuthReturnTo = () => {
  try {
    const { pathname, search, hash } = window.location;
    if (pathname.startsWith('/auth/')) {
      return;
    }
    localStorage.setItem(authReturnKey, `${pathname}${search || ''}${hash || ''}`);
  } catch (error) {
    // Ignore storage failures
  }
};

const formatDraftTimestamp = (value = '') => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString();
};

const renderBrowseModeBanner = (authenticated) => {
  const banner = document.getElementById(authBannerId);
  if (!banner) {
    return;
  }
  if (authenticated) {
    banner.innerHTML = '';
    banner.classList.add('is-hidden');
    return;
  }
  banner.innerHTML = `
    <div class="survey-auth-banner__body">
      <p class="survey-auth-banner__eyebrow">Browse mode</p>
      <h2 class="survey-auth-banner__title">Sign in to save your response</h2>
      <p class="survey-auth-banner__copy">
        You can read every question now, but answers are only recorded for signed-in users.
        Voter-verified totals only include verified registered voters.
      </p>
      <div class="survey-auth-banner__actions">
        <a class="button button--primary" href="/auth/login/" data-auth-open="login">Sign in to save</a>
        <a class="button button--secondary" href="/auth/signup/" data-auth-open="signup">Create account</a>
      </div>
    </div>
  `.trim();
  banner.classList.remove('is-hidden');
};

const bindBrowseModeActions = (slug, getAnswers) => {
  if (document.body.dataset.surveyAuthBound === 'true') {
    return;
  }
  document.body.dataset.surveyAuthBound = 'true';
  document.addEventListener('click', (event) => {
    const authTarget = event.target.closest('[data-auth-open]');
    if (!authTarget) {
      return;
    }
    storeAuthReturnTo();
    writeBrowseDraft(slug, getAnswers());
  });
};

const fetchSurveyAuthState = async () => {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      return { authenticated: false };
    }
    const data = await response.json();
    return {
      authenticated: !!data.authenticated,
      addressVerified: !!data.user?.address_verified,
    };
  } catch (error) {
    return { authenticated: false };
  }
};

const renderReceipt = (responseId) => {
  const status = document.getElementById(statusId);
  if (!status) {
    return;
  }
  const receiptText = responseId ? `Receipt ID: ${escapeHtml(responseId)}` : '';
  status.innerHTML = `
    <span>Thanks for completing the survey. ${receiptText}</span>
    <div class="survey-actions">
      <a class="button button--small" href="/surveys/list/">Back to surveys</a>
    </div>
  `.trim();
};

const showThankYouModal = (responseId) => {
  // Remove existing modal if any
  const existing = document.getElementById('thank-you-modal');
  if (existing) {
    existing.remove();
  }

  const receiptText = responseId ? `<p class="receipt-id">Receipt ID: <strong>${escapeHtml(responseId)}</strong></p>` : '';
  
  const modal = document.createElement('div');
  modal.id = 'thank-you-modal';
  modal.className = 'thank-you-modal';
  modal.innerHTML = `
    <div class="thank-you-modal__backdrop"></div>
    <div class="thank-you-modal__content">
      <h2>Thank You!</h2>
      <p class="thank-you-message">Your response has been recorded.</p>
      ${receiptText}
      <hr class="modal-divider">
      <p class="support-message"><strong>Support this work!</strong></p>
      <p class="campaign-message">Support Jimmy Skovgard for Senate in the Wyoming Republican Primary on <strong>August 18, 2026</strong>!</p>
      <div class="thank-you-actions">
        <a class="button button--primary pill-button" href="https://skovgard2026.org/volunteer" target="_blank" rel="noopener">Volunteer</a>
        <a class="button button--secondary pill-button" href="https://skovgard2026.org/donate" target="_blank" rel="noopener">Donate</a>
      </div>
      <div class="thank-you-close">
        <button class="button button--outline" type="button" id="thank-you-close-btn">Continue to Surveys</button>
      </div>
    </div>
  `.trim();
  
  document.body.appendChild(modal);
  document.body.classList.add('no-scroll');
  
  // Close handlers
  const closeBtn = document.getElementById('thank-you-close-btn');
  const backdrop = modal.querySelector('.thank-you-modal__backdrop');
  
  const closeModal = () => {
    modal.remove();
    document.body.classList.remove('no-scroll');
    window.location.href = '/surveys/list/';
  };
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  if (backdrop) {
    backdrop.addEventListener('click', closeModal);
  }
};

const buildSectionControls = (survey, meta, container) => {
  const existing = container.querySelector('.survey-section-controls');
  if (existing) {
    existing.remove();
  }

  const controls = document.createElement('div');
  controls.className = 'survey-actions survey-section-controls';

  const labelText = meta.sectionExitLabel || 'End of section';
  const label = document.createElement('div');
  label.className = 'helper-text';
  label.textContent = labelText;
  controls.appendChild(label);

  const continueButton = document.createElement('button');
  continueButton.type = 'button';
  continueButton.className = 'button button--primary';
  continueButton.textContent = survey.isLastPage ? 'Submit and finish' : 'Continue to next section';
  continueButton.addEventListener('click', () => {
    if (survey.isLastPage) {
      survey.doCurrentPageComplete(true);
      return;
    }
    survey.doCurrentPageComplete(false);
  });

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'button button--secondary';
  saveButton.textContent = 'Save my answers now and finish';
  saveButton.addEventListener('click', () => {
    survey.doCurrentPageComplete(true);
  });

  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.className = 'button button--small button--outline';
  exitButton.textContent = 'Exit without saving';
  exitButton.addEventListener('click', () => {
    const exitUrl = meta.exitUrl || '/surveys';
    window.location.assign(exitUrl);
  });

  controls.appendChild(continueButton);
  if (!survey.isLastPage) {
    controls.appendChild(saveButton);
  }
  controls.appendChild(exitButton);

  container.appendChild(controls);
};

const buildMeta = (answers = {}) => {
  const meta = {};
  const simpleFields = ['state', 'zip', 'postal_code', 'addr_raw', 'address', 'fn', 'ln'];
  simpleFields.forEach((field) => {
    if (answers[field]) {
      meta[field] = answers[field];
    }
  });
  return meta;
};

const initSurveyPage = async () => {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }
  const slug = getSlugFromPath();
  if (!slug) {
    setStatus('Survey not found.');
    return;
  }

  setStatus('Loading survey...');

  try {
    const authState = await fetchSurveyAuthState();
    renderBrowseModeBanner(authState.authenticated);

    const response = await fetch(`/api/surveys/${encodeURIComponent(slug)}`, {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error('Survey unavailable.');
    }
    const data = await response.json();
    if (!data || !data.surveyJson) {
      throw new Error('Survey unavailable.');
    }

    setTitle(data.title || 'Survey');
    setStatus('');

    const model = new Model(data.surveyJson);
    let editingMeta = null;
    let hasSavedResponse = false;
    const browseDraft = readBrowseDraft(slug);

    bindBrowseModeActions(slug, () => model.data || {});

    const surveyMeta = data.surveyJson?.x_meta || {};
    const enableSectionControls =
      surveyMeta.sectionExitEnabled === true || surveyMeta.flow === 'sectioned';
    if (enableSectionControls) {
      model.showNavigationButtons = 'none';
    }

    if (authState.authenticated) {
      try {
        const mineResponse = await fetch(
          `/api/responses/mine?surveyVersionId=${encodeURIComponent(data.versionId)}`,
          { credentials: 'include' }
        );
        if (mineResponse.ok) {
          const mineData = await mineResponse.json();
          if (mineData.exists && mineData.answersJson) {
            model.data = mineData.answersJson;
            editingMeta = mineData;
            hasSavedResponse = true;
            clearBrowseDraft(slug);
            const updatedAt = mineData.updatedAt || mineData.submittedAt;
            const editText = updatedAt
              ? `Editing mode. Last saved ${new Date(updatedAt).toLocaleString()}.`
              : 'Editing mode.';
            setEditingNotice(editText);
          }
        }
      } catch (error) {
        // Ignore prefill errors
      }
    }

    if (!hasSavedResponse && browseDraft?.answersJson) {
      model.data = browseDraft.answersJson;
      const restoredAt = formatDraftTimestamp(browseDraft.savedAt);
      if (authState.authenticated) {
        setEditingNotice(
          restoredAt
            ? `Unsaved draft restored from ${restoredAt}. Submit when ready.`
            : 'Unsaved draft restored. Submit when ready.'
        );
      } else {
        setEditingNotice(
          restoredAt
            ? `Unsaved browse-mode answers restored from ${restoredAt}. Sign in to save them.`
            : 'Unsaved browse-mode answers restored. Sign in to save them.'
        );
      }
    }

    model.onValueChanged.add((sender) => {
      writeBrowseDraft(slug, sender.data || {});
    });

    const promptForSignIn = (answersJson, message) => {
      authState.authenticated = false;
      renderBrowseModeBanner(false);
      storeAuthReturnTo();
      writeBrowseDraft(slug, answersJson || {});
      setStatus(message || 'Browse mode: sign in or create an account to save this response.');
      if (window.AuthModals && typeof window.AuthModals.open === 'function') {
        window.AuthModals.open('login');
        return;
      }
      window.location.href = '/auth/login/';
    };

    window.addEventListener('auth:changed', (event) => {
      const authenticated = !!event.detail?.authenticated;
      authState.authenticated = authenticated;
      renderBrowseModeBanner(authenticated);
    });

    model.onCompleting.add((sender, options) => {
      if (authState.authenticated) {
        return;
      }
      options.allow = false;
      options.allowComplete = false;
      promptForSignIn(sender.data || {}, 'Browse mode: sign in or create an account to save this response.');
    });

    model.onChoicesSearch.add((sender, options) => {
      if (!options.question || options.question.name !== 'state') {
        return;
      }
      const filter = (options.filter || '').trim().toLowerCase();
      if (filter.length < minStateSearchLength) {
        options.filteredChoices = [];
        return;
      }
      options.filteredChoices = options.choices.filter((choice) => {
        const text = (choice.text || choice.value || '').toString().toLowerCase();
        return text.startsWith(filter);
      });
    });
    if (enableSectionControls) {
      model.onAfterRenderPage.add((sender, options) => {
        if (!options || !options.htmlElement) {
          return;
        }
        buildSectionControls(sender, surveyMeta, options.htmlElement);
      });
    }
    model.onComplete.add(async (sender) => {
      try {
        setStatus('Submitting response...');
        const payload = {
          surveyVersionId: data.versionId,
          answersJson: sender.data || {},
          meta: buildMeta(sender.data || {}),
        };
        const submit = await fetch(
          `/api/surveys/${encodeURIComponent(slug)}/responses`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          }
        );
        if (submit.status === 401) {
          promptForSignIn(
            sender.data || {},
            'Your session ended. Sign in again to save this response.'
          );
          return;
        }
        if (!submit.ok) {
          throw new Error('Unable to submit response.');
        }
        const submitData = await submit.json();
        if (!submitData.ok) {
          throw new Error('Unable to submit response.');
        }
        clearBrowseDraft(slug);
        container.innerHTML = '';
        setStatus('');
        showThankYouModal(submitData.responseId);
        if (submitData.updatedAt) {
          setEditingNotice(`Saved. Last updated ${new Date(submitData.updatedAt).toLocaleString()}.`);
        }
        editingMeta = submitData;
      } catch (error) {
        setStatus(error.message || 'Unable to submit response.');
      }
    });

    renderSurvey(model, container);
  } catch (error) {
    setStatus(error.message || 'Survey unavailable.');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initSurveyPage();
});
