/* src/surveyjs-app.js */
import { Model } from 'survey-core';
import { renderSurvey } from 'survey-js-ui';

const statusId = 'surveyjs-status';
const titleId = 'surveyjs-title';
const containerId = 'surveyjs-root';
const editingId = 'surveyjs-editing';
const minStateSearchLength = 2;

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
    model.onComplete.add(async (sender) => {
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
          body: JSON.stringify(payload),
        }
      );
      if (!submit.ok) {
        throw new Error('Unable to submit response.');
      }
      const submitData = await submit.json();
      if (!submitData.ok) {
        throw new Error('Unable to submit response.');
      }
      container.innerHTML = '';
      renderReceipt(submitData.responseId);
      if (submitData.updatedAt) {
        setEditingNotice(`Saved. Last updated ${new Date(submitData.updatedAt).toLocaleString()}.`);
      }
      editingMeta = submitData;
    });

    renderSurvey(model, container);
  } catch (error) {
    setStatus(error.message || 'Survey unavailable.');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initSurveyPage();
});
