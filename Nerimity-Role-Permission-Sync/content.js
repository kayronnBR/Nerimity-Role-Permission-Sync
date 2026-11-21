(() => {
  const PERM_PAGE = /^https:\/\/nerimity\.com\/app\/servers\/(\d+)\/settings\/channels\/(\d+)\/permissions\/?$/;
  const SERVER_VIEW = /^https:\/\/nerimity\.com\/app\/servers\/(\d+)(?:\/(\d+))?\/?$/;
  const CHANNEL_LINK = (serverId) => new RegExp(`^/app/servers/${serverId}/(\\d+)/?$`);

  const STYLE_ID = 'npm-wizard-style';
  const BANNER_ID = 'npm-wizard-banner';
  const PANEL_ID = 'npm-wizard-panel';

  let wizard = null;
  let copiedRoles = {};
  let progress = { running: false, lines: [] };
  let lastUrl = location.href;

  const byId = (id) => document.getElementById(id);

  function injectStyle() {
    if (byId(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes npmPulse {
        0%, 100% { outline-color: #5865f2; }
        50% { outline-color: #a6b1ff; }
      }
      a.npm-channel {
        border-radius: 6px !important;
      }
      a.npm-channel.npm-pick {
        outline: 2px solid #5865f2 !important;
        outline-offset: 2px !important;
        animation: npmPulse 1.4s ease-in-out infinite !important;
        cursor: pointer !important;
      }
      a.npm-channel.npm-target {
        outline: 2px solid #23a55a !important;
        outline-offset: 2px !important;
        cursor: pointer !important;
      }
      a.npm-channel.npm-selected {
        outline-color: #faa61a !important;
      }
      a.npm-channel::after {
        content: attr(data-npm-badge);
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        padding: 2px 7px;
        border-radius: 10px;
        background: #5865f2;
        color: #fff;
        font: 10px/1.3 system-ui, sans-serif;
        pointer-events: none;
      }
      a.npm-channel.npm-selected::after {
        background: #faa61a;
        color: #1e1f22;
      }
      #${BANNER_ID} {
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483646;
        width: min(660px, calc(100vw - 28px));
        box-sizing: border-box;
        padding: 12px 16px;
        border: 1px solid #5865f2;
        border-radius: 10px;
        background: #232428;
        color: #f2f3f5;
        font: 13px/1.45 system-ui, sans-serif;
        box-shadow: 0 8px 30px rgba(0,0,0,.55);
      }
      #${BANNER_ID} .npm-title {
        font-weight: 700;
        margin-bottom: 3px;
      }
      #${BANNER_ID} .npm-sub {
        color: #b5bac1;
        font-size: 12px;
      }
      #${BANNER_ID} .npm-actions {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      #${BANNER_ID} button, #${PANEL_ID} button.npm-apply {
        padding: 7px 12px;
        border: 0;
        border-radius: 6px;
        background: #3f4147;
        color: #f2f3f5;
        font: 600 12px system-ui, sans-serif;
        cursor: pointer;
      }
      #${BANNER_ID} button.npm-primary, #${PANEL_ID} button.npm-apply {
        background: #5865f2;
        color: #fff;
      }
      #${BANNER_ID} button:disabled, #${PANEL_ID} button.npm-apply:disabled {
        background: #4e5058;
        cursor: default;
      }
      #${PANEL_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483645;
        width: 310px;
        max-height: 62vh;
        overflow: auto;
        box-sizing: border-box;
        padding: 12px;
        border: 1px solid #3f4147;
        border-radius: 10px;
        background: #1e1f22;
        color: #f2f3f5;
        font: 12px/1.45 system-ui, sans-serif;
        box-shadow: 0 8px 30px rgba(0,0,0,.55);
      }
      #${PANEL_ID} .npm-panel-title {
        font-weight: 700;
        margin-bottom: 6px;
      }
      #${PANEL_ID} .npm-roles {
        color: #b5bac1;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .npm-list {
        max-height: 170px;
        overflow: auto;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .npm-list label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 2px;
        cursor: pointer;
      }
      #${PANEL_ID} button.npm-apply {
        width: 100%;
        padding: 9px;
      }
      #npm-log {
        margin-top: 8px;
        max-height: 120px;
        overflow: auto;
        padding: 6px;
        border: 1px solid #3f4147;
        border-radius: 6px;
        background: #111214;
        font: 11px/1.5 ui-monospace, monospace;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `;
    document.head.appendChild(style);
  }

  function channelLinks() {
    if (!wizard?.serverId) return [];
    const re = CHANNEL_LINK(wizard.serverId);
    return [...document.querySelectorAll('a[href]')].filter((a) =>
      re.test(a.getAttribute('href') || '')
    );
  }

  function channelIdFrom(a) {
    return a.getAttribute('href').match(CHANNEL_LINK(wizard.serverId))?.[1] || null;
  }

  function clearChannelMarks() {
    document.querySelectorAll('a.npm-channel').forEach((a) => {
      a.classList.remove('npm-channel', 'npm-pick', 'npm-target', 'npm-selected');
      a.removeAttribute('data-npm-badge');
      a.style.position = '';
    });
  }

  function markChannels(mode) {
    clearChannelMarks();
    channelLinks().forEach((a) => {
      const id = channelIdFrom(a);
      if (!id) return;
      a.classList.add('npm-channel', mode === 'pick' ? 'npm-pick' : 'npm-target');
      a.style.position = 'relative';
      const chosen = wizard.targets.includes(String(id));
      if (mode === 'pick') {
        a.setAttribute('data-npm-badge', 'Copy from here');
      } else {
        a.setAttribute('data-npm-badge', chosen ? '✓' : '+');
        if (chosen) a.classList.add('npm-selected');
      }
    });
  }

  function hideBanner() {
    byId(BANNER_ID)?.remove();
  }

  function removePanel() {
    byId(PANEL_ID)?.remove();
  }

  function showBanner(title, sub, actions = []) {
    hideBanner();
    injectStyle();

    const banner = document.createElement('div');
    banner.id = BANNER_ID;

    const t = document.createElement('div');
    t.className = 'npm-title';
    t.textContent = title;
    banner.appendChild(t);

    if (sub) {
      const s = document.createElement('div');
      s.className = 'npm-sub';
      s.textContent = sub;
      banner.appendChild(s);
    }

    if (actions.length) {
      const wrap = document.createElement('div');
      wrap.className = 'npm-actions';
      actions.forEach((action) => {
        const btn = document.createElement('button');
        btn.textContent = action.label;
        btn.setAttribute('data-npm-action', action.action);
        if (action.primary) btn.className = 'npm-primary';
        if (action.disabled) btn.disabled = true;
        wrap.appendChild(btn);
      });
      banner.appendChild(wrap);
    }

    document.body.appendChild(banner);
  }

  function rolesForServer() {
    return Object.values(copiedRoles).filter(
      (r) => String(r.serverId) === String(wizard?.serverId)
    );
  }

  function renderPanel() {
    let panel = byId(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }
    injectStyle();
    panel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'npm-panel-title';
    title.textContent = 'Channels to receive';
    panel.appendChild(title);

    const rolesInfo = document.createElement('div');
    rolesInfo.className = 'npm-roles';
    rolesInfo.textContent = `Roles copied: ${rolesForServer().length}`;
    panel.appendChild(rolesInfo);

    const list = document.createElement('div');
    list.className = 'npm-list';

    const links = channelLinks();
    if (!links.length) {
      const empty = document.createElement('div');
      empty.style.color = '#b5bac1';
      empty.textContent = 'Open a channel in this server to see the list.';
      list.appendChild(empty);
    }

    links.forEach((a) => {
      const id = channelIdFrom(a);
      if (!id) return;
      const isSource = String(id) === String(wizard.sourceChannelId);
      const name =
        (a.innerText || a.textContent || '').replace(/^#\s*/, '').trim() || `Channel ${id}`;

      const label = document.createElement('label');
      label.style.cssText = 'display:flex;gap:8px;align-items:center;padding:4px 2px;cursor:pointer';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = id;
      cb.checked = wizard.targets.includes(String(id));
      cb.disabled = isSource;
      cb.addEventListener('change', () => toggleTarget(id));

      const span = document.createElement('span');
      span.textContent = isSource ? `${name} (source channel)` : name;

      label.append(cb, span);
      list.appendChild(label);
    });

    panel.appendChild(list);

    const apply = document.createElement('button');
    apply.className = 'npm-apply';
    apply.setAttribute('data-npm-action', 'apply');
    apply.textContent = progress.running
      ? 'Applying…'
      : `Apply permissions (${wizard.targets.length})`;
    apply.disabled = progress.running || !wizard.targets.length;
    panel.appendChild(apply);

    const log = document.createElement('div');
    log.id = 'npm-log';
    progress.lines.forEach((line) => {
      const div = document.createElement('div');
      div.style.color = line.ok === false ? '#f23f43' : '#23a55a';
      div.textContent = line.text;
      log.appendChild(div);
    });
    panel.appendChild(log);
    log.scrollTop = log.scrollHeight;
  }

  function renderPickSource() {
    injectStyle();
    removePanel();
    markChannels('pick');
    showBanner(
      'Which channel do you want to copy permissions from?',
      'Click one of the outlined channels. Its Permissions page opens directly.',
      [{ label: 'Cancel', action: 'cancel' }]
    );
  }

  function renderCopyRoles() {
    injectStyle();
    removePanel();
    clearChannelMarks();
    showBanner(
      'Now copy the roles',
      `Switch the role in the dropdown, change a permission, then click "Save this role" (or Nerimity's "Save changes"). Repeat for each role. Copied: ${rolesForServer().length}.`,
      [
        { label: 'Save this role', action: 'save-role', primary: true },
        { label: 'Done copying', action: 'finish-copy' },
        { label: 'Cancel', action: 'cancel' }
      ]
    );
  }

  function renderPickTargets() {
    const view = location.href.match(SERVER_VIEW);
    if (!view) {
      location.href = `https://nerimity.com/app/servers/${wizard.serverId}/${wizard.sourceChannelId}`;
      return;
    }
    injectStyle();
    markChannels('target');
    showBanner(
      'Choose the channels to receive',
      'Click the outlined channels or tick them in the list. Then click Apply permissions.',
      [{ label: 'Cancel', action: 'cancel' }]
    );
    renderPanel();
  }

  function rerender() {
    if (!wizard || wizard.phase === 'idle') {
      hideBanner();
      removePanel();
      clearChannelMarks();
      return;
    }

    const perm = location.href.match(PERM_PAGE);

    if (wizard.phase === 'pick-source') {
      renderPickSource();
      return;
    }

    if (wizard.phase === 'copy-roles') {
      if (perm && String(perm[2]) === String(wizard.sourceChannelId)) {
        renderCopyRoles();
      } else {
        injectStyle();
        removePanel();
        clearChannelMarks();
        showBanner(
          'Open Permissions for the source channel',
          `You chose: ${wizard.sourceName || wizard.sourceChannelId}. Click the button below to continue.`,
          [
            { label: 'Go to Permissions', action: 'go-perms', primary: true },
            { label: 'Cancel', action: 'cancel' }
          ]
        );
      }
      return;
    }

    if (wizard.phase === 'pick-targets') {
      renderPickTargets();
    }
  }

  async function setWizard(patch) {
    wizard = { ...(wizard || {}), ...patch };
    await chrome.storage.local.set({ wizard });
    rerender();
  }

  function permsUrl(channelId) {
    return `https://nerimity.com/app/servers/${wizard.serverId}/settings/channels/${channelId}/permissions`;
  }

  async function chooseSource(channelId, name) {
    await setWizard({
      phase: 'copy-roles',
      serverId: wizard.serverId,
      sourceChannelId: String(channelId),
      sourceName: name,
      targets: []
    });
    location.href = permsUrl(channelId);
  }

  function toggleTarget(channelId) {
    if (String(channelId) === String(wizard.sourceChannelId)) return;
    const targets = wizard.targets.map(String);
    const idx = targets.indexOf(String(channelId));
    if (idx >= 0) targets.splice(idx, 1);
    else targets.push(String(channelId));
    setWizard({ targets });
  }

  async function apply() {
    const roleIds = rolesForServer().map((r) => String(r.roleId));
    if (!roleIds.length || !wizard.targets.length) return;

    const res = await chrome.runtime.sendMessage({
      type: 'APPLY_COPIED',
      serverId: wizard.serverId,
      roleIds,
      channelIds: wizard.targets
    });

    if (res && !res.ok) {
      showBanner('Could not apply', res.error || 'Try again.', [
        { label: 'Close', action: 'dismiss' }
      ]);
    }
  }

  function handleAction(action) {
    if (action === 'cancel') {
      setWizard({ phase: 'idle', sourceChannelId: null, sourceName: '', targets: [] });
      return;
    }
    if (action === 'save-role') {
      announceRole();
      const saveButton = [...document.querySelectorAll('button')].find((button) =>
        /Save changes|Salvar mudanças/i.test(button.textContent || '')
      );
      if (saveButton && !saveButton.disabled) {
        saveButton.click();
      } else {
        showBanner(
          'Change a permission first',
          'In the dropdown above, pick the role and change Public channel / Send messages / Join voice. Nerimity\'s "Save changes" button unlocks after that.',
          [
            { label: 'Save this role', action: 'save-role', primary: true },
            { label: 'Done copying', action: 'finish-copy' },
            { label: 'Cancel', action: 'cancel' }
          ]
        );
      }
      return;
    }
    if (action === 'finish-copy') {
      setWizard({ phase: 'pick-targets' });
      return;
    }
    if (action === 'go-perms') {
      location.href = permsUrl(wizard.sourceChannelId);
      return;
    }
    if (action === 'apply') {
      apply();
      return;
    }
    if (action === 'dismiss') {
      hideBanner();
    }
  }

  function currentRoleName() {
    const box = document.querySelector(
      '[class*="_settingsBlock_"] [class*="_dropDown_"]'
    );
    return (box?.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function announceRole() {
    const name = currentRoleName();
    if (name) chrome.runtime.sendMessage({ type: 'ROLE_SELECTED', name }).catch(() => {});
  }

  // Clicks: assistant buttons, channel selection, and Nerimity's Save changes button.
  document.addEventListener(
    'click',
    (event) => {
      const actionEl = event.target.closest('[data-npm-action]');
      if (actionEl) {
        event.preventDefault();
        event.stopPropagation();
        handleAction(actionEl.getAttribute('data-npm-action'));
        return;
      }

      const saveButton = event.target.closest('button');
      if (saveButton && /Save changes|Salvar mudanças/i.test(saveButton.textContent || '')) {
        announceRole();
      }
      if (event.target.closest('[class*="_dropDown_"], [class*="_itemTemplate_"]')) {
        setTimeout(announceRole, 120);
      }

      if (!wizard || !['pick-source', 'pick-targets'].includes(wizard.phase)) return;

      const link = event.target.closest('a[href]');
      if (!link) return;
      const id = channelIdFrom(link);
      if (!id) return;

      event.preventDefault();
      event.stopPropagation();

      if (wizard.phase === 'pick-source') {
        chooseSource(id, (link.innerText || link.textContent || '').replace(/^#\s*/, '').trim());
      } else {
        toggleTarget(id);
      }
    },
    true
  );

  document.addEventListener(
    'change',
    (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox') {
        announceRole();
      }
    },
    true
  );

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.wizard) {
      wizard = changes.wizard.newValue || null;
      rerender();
    }
    if (changes.copiedRoles) {
      copiedRoles = changes.copiedRoles.newValue || {};
      if (wizard?.phase === 'copy-roles') renderCopyRoles();
      else if (wizard?.phase === 'pick-targets') renderPanel();
    }
    if (changes.applyProgress) {
      progress = changes.applyProgress.newValue || { running: false, lines: [] };
      if (byId(PANEL_ID)) renderPanel();
    }
  });

  chrome.runtime.onMessage.addListener(async (message) => {
    if (message?.type === 'START_WIZARD') {
      const match = location.href.match(/^https:\/\/nerimity\.com\/app\/servers\/(\d+)/);
      if (!match) {
        return { ok: false, error: 'Open a Nerimity server first.' };
      }
      copiedRoles = {};
      progress = { running: false, lines: [] };
      await chrome.storage.local.set({ copiedRoles, applyProgress: progress });
      await setWizard({
        phase: 'pick-source',
        serverId: match[1],
        sourceChannelId: null,
        sourceName: '',
        targets: []
      });
      if (!channelLinks().length) {
        location.href = `https://nerimity.com/app/servers/${match[1]}`;
      }
      return { ok: true };
    }

    if (message?.type === 'CANCEL_WIZARD') {
      await setWizard({ phase: 'idle', sourceChannelId: null, sourceName: '', targets: [] });
      return { ok: true };
    }

    if (message?.type === 'GET_WIZARD_STATE') {
      return { ok: true, wizard, copiedRoles, progress, url: location.href };
    }

    if (message?.type === 'PROGRESS') {
      progress = { running: !!message.running, lines: message.lines || [] };
      if (byId(PANEL_ID)) renderPanel();
    }
  });

  function checkRoute() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      rerender();
    }
  }
  window.addEventListener('popstate', checkRoute);
  ['pushState', 'replaceState'].forEach((key) => {
    const original = history[key];
    history[key] = function (...args) {
      const result = original.apply(this, args);
      checkRoute();
      return result;
    };
  });
  setInterval(checkRoute, 800);

  try {
    const token = localStorage.getItem('userToken');
    if (token) chrome.storage.local.set({ token });
  } catch (_err) {}

  chrome.storage.local
    .get(['wizard', 'copiedRoles', 'applyProgress'])
    .then((stored) => {
      wizard = stored.wizard || null;
      copiedRoles = stored.copiedRoles || {};
      progress = stored.applyProgress || { running: false, lines: [] };
      rerender();
    });
})();
