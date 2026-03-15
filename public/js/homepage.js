/* public/js/homepage.js */
(() => {
  if (window.location.pathname !== '/') {
    return;
  }

  const cardGrid = document.getElementById('landing-card-grid');
  const cardTemplate = document.getElementById('landing-card-template');
  const accountTitle = document.getElementById('landing-account-title');
  const accountMessage = document.getElementById('landing-account-message');
  const accountActions = document.getElementById('landing-account-actions');
  let continueTitle = null;
  let continueQuestion = null;
  let continueBody = null;
  let continueActions = null;

  if (
    !cardGrid ||
    !cardTemplate ||
    !accountTitle ||
    !accountMessage ||
    !accountActions
  ) {
    return;
  }

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatTimestamp = (value = '') => {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const createCtaElement = (config, className) => {
    if (!config || !config.label) {
      return null;
    }

    const element = document.createElement(config.authOpen ? 'button' : 'a');
    element.className = className;
    element.textContent = config.label;

    if (config.authOpen) {
      element.type = 'button';
      element.setAttribute('data-auth-open', config.authOpen);
    } else if (config.href) {
      element.href = config.href;
    } else {
      return null;
    }

    return element;
  };

  const cardConfigs = [
    {
      key: 'survey',
      variant: 'landing-card--survey',
      eyebrow: 'Browse Surveys',
      title: 'What matters most right now?',
      question: 'Review current survey topics and add your voice.',
      body: 'Start with a survey, finish in minutes, and keep your receipt.',
      imagePath: '/assets/cards/survey.webp',
      tint: '#efe5d8',
      primary: { label: 'Browse surveys', href: '/surveys/list/' },
      secondary: { label: 'Review results', href: '/surveys/results/' },
    },
    {
      key: 'townhall',
      variant: 'landing-card--townhall',
      eyebrow: 'Join Discussions',
      title: 'What should Wyoming hear next?',
      question: 'Read statements, review receipts, and add context to the issues.',
      body: 'Town Hall topics stay tied to live surveys so discussion and evidence stay together.',
      imagePath: '/assets/cards/townhall.webp',
      tint: '#ebe1d4',
      primary: { label: 'Join discussions', href: '/townhall/' },
      secondary: { label: 'How verification works', href: '/security/' },
    },
    {
      key: 'continue',
      variant: 'landing-card--continue',
      eyebrow: 'Continue / My Progress',
      title: 'Ready to continue?',
      question: 'Sign in to return to your surveys, discussions, and account tools.',
      body: 'If you already have an account, we will bring you back to the best next step we can find.',
      imagePath: '/assets/cards/continue.webp',
      tint: '#ece2d5',
      primary: { label: 'Sign in to continue', authOpen: 'login' },
      secondary: { label: 'Go to account', href: '/account/' },
      id: 'landing-continue-card',
    },
  ];

  const renderLandingCards = () => {
    const fragment = document.createDocumentFragment();

    cardConfigs.forEach((config) => {
      const node = cardTemplate.content.firstElementChild.cloneNode(true);
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.classList.add(config.variant);
      node.dataset.cardKey = config.key;
      node.style.setProperty('--landing-card-image', `url("${config.imagePath}")`);
      node.style.setProperty('--landing-card-tint', config.tint);
      if (config.id) {
        node.id = config.id;
      }

      const eyebrowEl = node.querySelector('[data-card-eyebrow]');
      const titleEl = node.querySelector('[data-card-title]');
      const questionEl = node.querySelector('[data-card-question]');
      const bodyEl = node.querySelector('[data-card-body]');
      const actionsEl = node.querySelector('[data-card-actions]');

      if (eyebrowEl) {
        eyebrowEl.textContent = config.eyebrow;
      }
      if (titleEl) {
        titleEl.textContent = config.title;
        if (config.key === 'continue') {
          titleEl.id = 'landing-continue-title';
          continueTitle = titleEl;
        }
      }
      if (questionEl) {
        questionEl.textContent = config.question;
        if (config.key === 'continue') {
          questionEl.id = 'landing-continue-question';
          continueQuestion = questionEl;
        }
      }
      if (bodyEl) {
        bodyEl.textContent = config.body;
        if (config.key === 'continue') {
          bodyEl.id = 'landing-continue-body';
          continueBody = bodyEl;
        }
      }
      if (actionsEl) {
        actionsEl.replaceChildren();
        if (config.key === 'continue') {
          actionsEl.id = 'landing-continue-actions';
          continueActions = actionsEl;
        }
        const primaryEl = createCtaElement(config.primary, 'button button--primary');
        const secondaryEl = createCtaElement(config.secondary, 'landing-card__link');
        if (primaryEl) {
          actionsEl.appendChild(primaryEl);
        }
        if (secondaryEl) {
          actionsEl.appendChild(secondaryEl);
        }
      }

      fragment.appendChild(node);
    });

    cardGrid.replaceChildren(fragment);
  };

  renderLandingCards();

  const setSignedOutState = () => {
    accountTitle.textContent = 'Create a free account';
    accountMessage.textContent =
      'Save your place, return to surveys and Town Halls, and keep your receipts and participation history in one place.';
    accountActions.innerHTML = `
      <button class="button button--primary" type="button" data-auth-open="signup">Create account</button>
      <button class="button button--secondary" type="button" data-auth-open="login">Sign in</button>
    `;

    continueTitle.textContent = 'Ready to continue?';
    continueQuestion.textContent =
      'Sign in to return to your surveys, discussions, and account tools.';
    continueBody.textContent =
      'If you already have an account, we will bring you back to the best next step we can find.';
    continueActions.innerHTML = `
      <button class="button button--primary" type="button" data-auth-open="login">Sign in to continue</button>
      <a class="landing-card__link" href="/account/">Go to account</a>
    `;
  };

  const setSignedInDefault = (email = '') => {
    const safeEmail = escapeHtml(email);
    accountTitle.textContent = 'Welcome back';
    accountMessage.innerHTML = safeEmail
      ? `Signed in as <strong>${safeEmail}</strong>. Pick up your next survey, review your account, or join a Town Hall topic.`
      : 'Pick up your next survey, review your account, or join a Town Hall topic.';
    accountActions.innerHTML = `
      <a class="button button--primary" href="/account/">My account</a>
      <a class="button button--secondary" href="/surveys/list/">Browse surveys</a>
    `;

    continueTitle.textContent = 'Continue from your account';
    continueQuestion.textContent = 'Your next step is ready.';
    continueBody.textContent = 'We are checking your latest survey activity now.';
    continueActions.innerHTML = `
      <a class="button button--primary" href="/surveys/list/">Browse surveys</a>
      <a class="landing-card__link" href="/townhall/">Open Town Hall</a>
    `;
  };

  const setNeedsAddressVerification = () => {
    continueTitle.textContent = 'Finish setup first';
    continueQuestion.textContent = 'Verify your address to unlock survey participation.';
    continueBody.textContent =
      'Your account is active, but survey access still depends on address verification for district-aware results.';
    continueActions.innerHTML = `
      <a class="button button--primary" href="/account/location/">Finish setup</a>
      <a class="landing-card__link" href="/account/">Review account</a>
    `;
  };

  const setResumeFromSurvey = (survey) => {
    const updatedAt = formatTimestamp(survey.response?.updatedAt || survey.response?.submittedAt);
    const safeTitle = escapeHtml(survey.title || 'your survey');
    const surveyHref = `/surveys/${encodeURIComponent(survey.slug)}`;

    continueTitle.textContent = 'Ready to continue?';
    continueQuestion.textContent = `Return to ${survey.title || 'your latest survey'}.`;
    continueBody.textContent = updatedAt
      ? `Last updated ${updatedAt}. Review or edit your saved responses now.`
      : 'You already have survey activity saved. Return to review or update your responses.';
    continueActions.innerHTML = `
      <a class="button button--primary" href="${surveyHref}">Continue ${safeTitle}</a>
      <a class="landing-card__link" href="/surveys/results/?slug=${encodeURIComponent(survey.slug)}">View results</a>
    `;
  };

  const setNoResumeYet = () => {
    continueTitle.textContent = 'Ready to start?';
    continueQuestion.textContent = 'Choose a survey and save your progress as you go.';
    continueBody.textContent =
      'We did not find a completed survey yet, so the best next step is to browse current topics.';
    continueActions.innerHTML = `
      <a class="button button--primary" href="/surveys/list/">Browse surveys</a>
      <a class="landing-card__link" href="/townhall/">Open Town Hall</a>
    `;
  };

  const loadResumeState = async (user) => {
    if (!user?.address_verified) {
      setNeedsAddressVerification();
      return;
    }

    try {
      const response = await fetch('/api/surveys/list', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        setNoResumeYet();
        return;
      }
      const surveys = await response.json();
      if (!Array.isArray(surveys)) {
        setNoResumeYet();
        return;
      }
      const withResponses = surveys
        .filter((survey) => survey && survey.status === 'active' && survey.response)
        .sort((left, right) => {
          const leftTime = new Date(left.response?.updatedAt || left.response?.submittedAt || 0).getTime();
          const rightTime = new Date(right.response?.updatedAt || right.response?.submittedAt || 0).getTime();
          return rightTime - leftTime;
        });

      if (withResponses.length) {
        setResumeFromSurvey(withResponses[0]);
        return;
      }

      setNoResumeYet();
    } catch (error) {
      setNoResumeYet();
    }
  };

  const applyAuthState = async () => {
    const authUI = window.AuthUI;
    if (!authUI || typeof authUI.fetchAuthState !== 'function') {
      window.setTimeout(applyAuthState, 150);
      return;
    }

    const authenticated = await authUI.fetchAuthState();
    if (!authenticated) {
      setSignedOutState();
      return;
    }

    const authState = authUI.state || {};
    setSignedInDefault(authState.email || '');

    try {
      const meResponse = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!meResponse.ok) {
        return;
      }
      const data = await meResponse.json();
      if (!data.authenticated || !data.user) {
        setSignedOutState();
        return;
      }
      await loadResumeState(data.user);
    } catch (error) {
      return;
    }
  };

  window.addEventListener('auth:changed', () => {
    applyAuthState();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAuthState, { once: true });
  } else {
    applyAuthState();
  }
})();
