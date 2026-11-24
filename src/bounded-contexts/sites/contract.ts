// The message Sites sends from one part of the extension to another: the popup or the editor
// asking the background to register the content scripts again. store.ts sends it when it has saved
// the sites you added, and the background answers once it has registered them, or failed to,
// which it logs (src/app/background/on-message.ts, schedule-sync.ts): a tab reloaded after the
// answer gets the change, unless registering failed. A type only:
// nothing of this file ends up in the built extension. The background reads it in a union with
// Traffic's messages, which it puts together there. It's Sites' published language
// (GLOSSARY-MAP.md).
export interface SyncMessage {
  type: 'ghostfetch:sync';
}
