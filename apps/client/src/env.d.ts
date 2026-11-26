/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Address of the server, for a build that the server does not serve itself (the native app). */
  readonly VITE_SERVER_URL?: string;
  /** Address of the public website, used in the links and QR codes people share. */
  readonly VITE_PUBLIC_URL?: string;
}
