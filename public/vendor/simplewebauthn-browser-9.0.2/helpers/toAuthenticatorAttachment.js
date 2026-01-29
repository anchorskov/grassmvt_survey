// public/vendor/simplewebauthn-browser-9.0.2/helpers/toAuthenticatorAttachment.js
const attachments = ['cross-platform', 'platform'];
/**
 * If possible coerce a `string` value into a known `AuthenticatorAttachment`
 */
export function toAuthenticatorAttachment(attachment) {
    if (!attachment) {
        return;
    }
    if (attachments.indexOf(attachment) < 0) {
        return;
    }
    return attachment;
}
