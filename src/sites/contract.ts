// The message Sites sends from one part of the extension to another: the popup or the editor
// asking the background to register the content scripts again. store.ts sends it when it has saved
// the sites you added, and the background answers once it has registered them
// (src/app/background/on-message.ts), so a tab reloaded after that gets the change. A type only:
// nothing of this file ends up in the built extension. RuntimeMessage
// (src/shared/api/messages.ts) has the same member, which is how the background reads it.
export interface SyncMessage {
  type: 'ghostfetch:sync';
}
