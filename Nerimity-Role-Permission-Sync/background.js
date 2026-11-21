const API = 'https://nerimity.com';

// POST used by Nerimity itself when saving a role's channel permissions.
const PERM_URL = /^https:\/\/nerimity\.com\/api\/servers\/(\d+)\/channels\/(\d+)\/permissions\/(\d+)(?:\?|$)/;

// Ignore requests made by the extension so they aren't recorded as new copies.
const ownRequests = new Set();
let currentRoleName = '';

function markOwn(url) {
  ownRequests.add(url);
  setTimeout(() => ownRequests.delete(url), 20000);
}

function isOwn(url) {
  return ownRequests.has(url);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setProgress(running, lines) {
  await chrome.storage.local.set({ applyProgress: { running, lines, at: Date.now() } });
}

async function emitProgress(running, lines, line) {
  const next = line ? [...lines, line] : lines;
  await setProgress(running, next);

  const msg = { type: 'PROGRESS', running, lines: next };
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch (_err) {}

  try {
    const tabs = await chrome.tabs.query({ url: 'https://nerimity.com/app/servers/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  } catch (_err) {}
}

// Record the role whenever Nerimity saves permissions (user clicked Save changes).
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.method !== 'POST') return;

    const match = PERM_URL.exec(details.url);
    if (!match) return;
    if (isOwn(details.url)) return;

    let permissions;
    try {
      const bytes = details.requestBody?.raw?.[0]?.bytes;
      if (!bytes) return;
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof body.permissions !== 'number') return;
      permissions = body.permissions;
    } catch (_err) {
      return;
    }

    const [, serverId, _channelId, roleId] = match;
    const cfg = await chrome.storage.local.get(['copiedRoles', 'wizard']);
    const roles = cfg.copiedRoles && typeof cfg.copiedRoles === 'object' ? cfg.copiedRoles : {};

    roles[roleId] = {
      roleId: String(roleId),
      name: currentRoleName || `Role ${roleId}`,
      permissions,
      serverId: String(serverId),
      at: Date.now()
    };
    currentRoleName = '';

    await chrome.storage.local.set({ copiedRoles: roles });

    try {
      const tabs = await chrome.tabs.query({ url: 'https://nerimity.com/app/servers/*' });
      for (const tab of tabs) {
        chrome.tabs
          .sendMessage(tab.id, { type: 'COPIED_ROLE', roleId, name: roles[roleId].name })
          .catch(() => {});
      }
    } catch (_err) {}
  },
  {
    urls: [`${API}/api/servers/*/channels/*/permissions/*`],
    types: ['xmlhttprequest']
  },
  ['requestBody']
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'ROLE_SELECTED') {
    currentRoleName = String(message.name || '').trim();
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === 'CLEAR_COPIED') {
    chrome.storage.local
      .set({ copiedRoles: {}, applyProgress: { running: false, lines: [], at: Date.now() } })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'APPLY_COPIED') {
    applyCopied(message).then(sendResponse);
    return true;
  }
});

async function applyCopied({ serverId, channelIds, roleIds }) {
  const cfg = await chrome.storage.local.get(['copiedRoles', 'token']);
  const roles = cfg.copiedRoles || {};

  const selectedRoles = (roleIds || []).filter(
    (id) => roles[id] && String(roles[id].serverId) === String(serverId)
  );
  const targets = [...new Set((channelIds || []).map(String))];

  if (!cfg.token) {
    return { ok: false, error: 'Session token not found. Reload the Nerimity tab.' };
  }
  if (!selectedRoles.length) {
    return { ok: false, error: 'No roles copied for this server.' };
  }
  if (!targets.length) {
    return { ok: false, error: 'Select at least one target channel.' };
  }

  const lines = [];
  await emitProgress(
    true,
    lines,
    { text: `Starting: ${selectedRoles.length} role(s) → ${targets.length} channel(s)`, ok: true }
  );

  let ok = 0;
  let fail = 0;

  for (const targetId of targets) {
    for (const roleId of selectedRoles) {
      const role = roles[roleId];
      const url = `${API}/api/servers/${serverId}/channels/${targetId}/permissions/${roleId}`;
      markOwn(url);

      let success = false;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: cfg.token
          },
          body: JSON.stringify({ permissions: role.permissions })
        });
        success = res.ok;
      } catch (_err) {
        success = false;
      }

      success ? ok++ : fail++;
      await emitProgress(true, lines, {
        text: `${success ? 'OK' : 'FAILED'} • ${role.name} → channel ${targetId}`,
        ok: success
      });
      await sleep(120);
    }
  }

  await emitProgress(false, lines, {
    text: `Done: ${ok} applied, ${fail} failed`,
    ok: fail === 0
  });

  return { ok: true, okCount: ok, failCount: fail };
}
