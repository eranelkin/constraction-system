/// <reference types="expo/types" />

// Declare process.env for Expo's bundler-injected env vars
declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    NODE_ENV?: string;
    [key: string]: string | undefined;
  };
};
