# Teleir multi-select / copy / download fix

Applied changes:

- Multi-select remains active after choosing **Select** from a message menu.
- In multi-select mode, tapping other message bubbles toggles them into/out of selection.
- The selection bar supports bulk actions:
  - Forward selected messages
  - Delete selected messages for me
  - Delete selected messages for everyone
  - Pin/Unpin only when exactly one message is selected
- Added a visible selection indicator on message bubbles while selection mode is active.
- Removed image/file copy behavior from message actions.
- For messages that only contain an image/file, the context menu shows **Download** instead of **Copy**.
- For messages containing text, **Copy** copies only the message text directly to clipboard.
- Copy no longer opens a prompt/modal with extra text.
- If Clipboard API is blocked, the code uses a hidden textarea fallback without showing an extra prompt.

Notes:

- Build was not executed in this environment because npm dependencies are not installed and registry access is unavailable.
- After deployment, test: select one message, then tap/click several more messages, then use Forward/Delete.
