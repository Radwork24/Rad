/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly FIREBASE_API_KEY: string;
  readonly FIREBASE_AUTH_DOMAIN: string;
  readonly FIREBASE_PROJECT_ID: string;
  readonly FIREBASE_STORAGE_BUCKET: string;
  readonly FIREBASE_MESSAGING_SENDER_ID: string;
  readonly FIREBASE_APP_ID: string;
  readonly FIREBASE_MEASUREMENT_ID: string;
  readonly FIREBASE_DATABASE_ID?: string;
  readonly LITHOSAI_API_KEY?: string;
  readonly LITHOSAI_BASE_URL?: string;
  readonly LITHOSAI_MODELS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
