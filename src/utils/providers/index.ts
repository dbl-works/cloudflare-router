import { s3 } from './s3'

/**
 * A storage provider turns an origin shorthand into an HTTPS URL.
 * To add a provider, create a module next to this one and list it below.
 */
export interface StorageProvider {
  /** URL scheme of the shorthand, without the colon. */
  scheme: string
  /** Human-readable form of the shorthand, for error messages. */
  usage: string
  /**
   * Parses one complete shorthand. Returns the HTTPS URL, or the reason the
   * shorthand is invalid. Every rule of the provider lives here, so a
   * shorthand is either fully valid or rejected with a reason.
   */
  parse(origin: string): { url: string } | { error: string }
}

const PROVIDERS: StorageProvider[] = [s3]

/** Returns the provider whose scheme starts the origin, or undefined. */
export const providerFor = (origin: string): StorageProvider | undefined =>
  PROVIDERS.find((provider) => origin.startsWith(`${provider.scheme}://`))
