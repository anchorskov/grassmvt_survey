// public/vendor/simplewebauthn-browser-9.0.2/helpers/browserSupportsWebAuthn.js
/**
 * Determine if the browser is capable of Webauthn
 */
export function browserSupportsWebAuthn() {
    return _browserSupportsWebAuthnInternals.stubThis(globalThis?.PublicKeyCredential !== undefined &&
        typeof globalThis.PublicKeyCredential === 'function');
}
/**
 * Make it possible to stub the return value during testing
 * @ignore Don't include this in docs output
 */
export const _browserSupportsWebAuthnInternals = {
    stubThis: (value) => value,
};
