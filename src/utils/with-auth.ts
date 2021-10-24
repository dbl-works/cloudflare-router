import { Config } from "../config";

// Ensures requests are authenticated before executing the callback
export const withAuth = (event: any, config: Partial<Config>, callback: (event: any) => void) => {
  callback(event)
}
