const $ = (id) => document.getElementById(id);

async function withTab(fn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { ok: false, error: 'No active tab.' };
  try {
    return await fn(tab);
  } catch (_err) {
    return { ok: false, error: 'Open Nerimity and reload the tab.' };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const result = await withTab((tab) =>
    chrome.tabs.sendMessage(tab.id, { type: 'START_WIZARD' })
  );

  if (result?.ok) {
    $('status').textContent = 'Channels highlighted. Click the channel to copy from.';
    $('help').textContent =
      'Look at the page: the channels are outlined. Click one to open its Permissions page.';
  } else {
    $('status').style.color = '#f23f43';
    $('status').textContent = result?.error || 'Could not start.';
  }

  $('cancel').addEventListener('click', async () => {
    const res = await withTab((tab) =>
      chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_WIZARD' })
    );
    $('status').style.color = '#b5bac1';
    $('status').textContent = res?.ok ? 'Assistant closed.' : 'Nothing to cancel.';
  });
});
