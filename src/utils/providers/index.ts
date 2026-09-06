import { s3 } from './s3'

/**
 * A storage provider turns an origin shorthand into an HTTPS URL.
 * To add a provider, create a module next to this one and list it below.
 */
export interface StorageProvider {
  /** URL scheme of the shorthand, without the colon. */
  scheme: string
  /** Matches a complete, valid shorthand. */
  shorthand: RegExp
  /** Human-readable form of the shorthand, for error messages. */
  usage: string
  /** Converts a valid shorthand to an HTTPS URL. */
  resolve(origin: string): string
}

const PROVIDERS: StorageProvider[] = [s3]

/** Returns the provider whose scheme starts the origin, or undefined. */
export const providerFor = (origin: string): StorageProvider | undefined =>
  PROVIDERS.find((provider) => origin.startsWith(`${provider.scheme}://`))
