import type { Session } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { denyAllPermissions } from './permissions';

type RequestHandler = (
  webContents: unknown,
  permission: string,
  callback: (granted: boolean) => void,
) => void;
type CheckHandler = (webContents: unknown, permission: string, origin: string) => boolean;
type DeviceHandler = (details: unknown) => boolean;

function fakeSession() {
  const handlers: {
    request?: RequestHandler;
    check?: CheckHandler;
    device?: DeviceHandler;
  } = {};
  const session = {
    setPermissionRequestHandler: vi.fn((handler: RequestHandler) => {
      handlers.request = handler;
    }),
    setPermissionCheckHandler: vi.fn((handler: CheckHandler) => {
      handlers.check = handler;
    }),
    setDevicePermissionHandler: vi.fn((handler: DeviceHandler) => {
      handlers.device = handler;
    }),
  };
  return { session: session as unknown as Session, handlers };
}

const PERMISSIONS = [
  'media',
  'geolocation',
  'notifications',
  'midi',
  'clipboard-read',
  'display-capture',
  'fullscreen',
  'openExternal',
  'unknown',
];

describe('denyAllPermissions', () => {
  it('refuses every permission request, whatever the page and the permission', () => {
    const { session, handlers } = fakeSession();
    denyAllPermissions(session);
    for (const permission of PERMISSIONS) {
      const answer = vi.fn();
      handlers.request?.(null, permission, answer);
      expect(answer, permission).toHaveBeenCalledExactlyOnceWith(false);
    }
  });

  it('answers every permission check with no', () => {
    const { session, handlers } = fakeSession();
    denyAllPermissions(session);
    for (const permission of PERMISSIONS) {
      expect(handlers.check?.(null, permission, 'file://'), permission).toBe(false);
    }
  });

  it('gives no access to USB, HID or serial devices', () => {
    const { session, handlers } = fakeSession();
    denyAllPermissions(session);
    expect(handlers.device?.({})).toBe(false);
  });
});
