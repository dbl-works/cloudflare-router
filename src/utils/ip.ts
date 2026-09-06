const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/**
 * Canonical text form of an IP address, or undefined when the value is not
 * one address. Configured addresses and the client address both pass
 * through here, so `2001:DB8::1` and `2001:db8:0:0:0:0:0:1` compare equal.
 * A CIDR range or a hostname is not an address.
 */
export function canonicalIp(value: string): string | undefined {
  if (IPV4.test(value)) return value
  if (!value.includes(':')) return undefined
  try {
    return new URL(`http://[${value}]/`).hostname.slice(1, -1)
  } catch {
    return undefined
  }
}
