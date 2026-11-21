# Nerimity – Copy Role Permissions (guided assistant)

A Chrome MV3 extension. You don't need to understand settings — the assistant appears inside Nerimity itself.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
4. Reload the Nerimity tab

## How to use

1. **Click the extension icon.** The channels in the server get a blue outline.
2. **Click the source channel** (the one you are copying from). It opens directly in *Channel Settings → Permissions*.
3. A notice appears:
   > Switch the role in the dropdown, change a permission, then click **Save this role**. Repeat for each role.
4. When you are done, click **Done copying**.
5. The view returns to all channels, now with a green outline. **Click the channels that should receive** the permissions (or tick them in the list on the right).
6. Click **Apply permissions** and watch the real-time log.

## Assistant buttons

- **Save this role** → saves the currently selected role (clicks Nerimity's own *Save changes* button for you)
- **Done copying** → goes back to target channel selection
- **Apply permissions (N)** → copies all copied roles to the N selected channels
- **Cancel** → closes the assistant and removes the outlines
- In the popup: **Cancel assistant** → same

## Notes

- Nerimity's own **Save changes** button stays disabled until you change a permission (Public channel / Send messages / Join voice). Use **Save this role** in the assistant instead if that is clearer.
- The source channel cannot be a target — it already received the change when you clicked Save.
- Copied roles are stored in the browser until you start a new assistant session (clicking the icon clears the list).
- You need the **Manage channels** permission in the server.
- Works only on `https://nerimity.com`.
