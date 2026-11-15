import type { Session } from 'electron';

/**
 * Refuse every permission a page can ask for (camera, microphone, location, notifications,
 * clipboard reads, devices...). Electron grants most of them by default, and nothing in the app
 * needs one: the renderer reaches the system only through the preload's API.
 */
export function denyAllPermissions(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
}
