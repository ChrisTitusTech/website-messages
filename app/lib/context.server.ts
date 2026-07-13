import { createContext, type RouterContextProvider } from "react-router";
import type { AppEnv, AppLoadContext } from "./types";

export const appContext = createContext<AppLoadContext>();

export function getEnv(context: unknown): AppEnv {
  return (context as RouterContextProvider).get(appContext).cloudflare.env;
}
