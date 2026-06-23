// src/lib/mpesa/generateCredential.js
//
// One-time utility to generate the MPESA_SECURITY_CREDENTIAL.
//
// Usage (from project root):
//   node -e "
//     const { generateSecurityCredential } = require('./src/lib/mpesa/generateCredential');
//     console.log(generateSecurityCredential('YOUR_INITIATOR_PASSWORD', 'sandbox'));
//   "
//
// Then copy the output into your .env as MPESA_SECURITY_CREDENTIAL=...

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// Safaricom public key certificates (base64-encoded PEM content)
// These are the official certificates from https://developer.safaricom.co.ke/certificates/
const SANDBOX_CERT = `-----BEGIN CERTIFICATE-----
MIIGkzCCBXugAwIBAgIKXfBp5gAAADk+VDANBgkqhkiG9w0BAQsFADBbMRMwEQYK
CZImiZPyLGQBGRYDbmV0MRkwFwYKCZImiZPyLGQBGRYJc2FmYXJpY29tMSkwJwYD
VQQDEyBTYWZhcmljb20gSW50ZXJuYWwgSXNzdWluZyBDQSAwMjAeFw0xNzA0MjUx
NjE2MDNaFw0xOTA0MjUxNjE2MDNaMIGNMQswCQYDVQQGEwJLRTEQMA4GA1UECBMH
TmFpcm9iaTEQMA4GA1UEBxMHTmFpcm9iaTEaMBgGA1UEChMRU2FmYXJpY29tIExp
bWl0ZWQxEzARBgNVBAsTClRlY2hub2xvZ3kxKTAnBgNVBAMTIGFwaWdlZS5hcGlj
YWxsZXIuc2FmYXJpY29tLmNvLmtlMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAoknIb5Tm1hxOVdFsOejAs6veAai32K7ZkJOCBAlMzADEB2MJKnOBqXOC
01Jm0KOV/HcGP9v9MzBJOGYOV42xd4GACIb3sBzHYIf8JDIGoIIv1JhP41OJcKMF
LSZiYQz0jlMICRGMON3eswraGN9oEiMJHyBfQvIsBf9DlYMGnbAlzGMBtFOEhJzF
QxVtNpl/3LGKh8JHdJSNPG1UYPCzOWa/LNLh9ElVCfwJOkZIPoihbCNRbwChPrrn
S2UyGfqSFjaIjBYRo7oK+UEDDJwJLnCDJLsLgNVP5OVxBe2VnhCBRXzkWr3LnSM
Mh4K8pVVTnjw5iq0RxBBuvRkflwjuQIDAQABo4IDIjCCAx4wHQYDVR0OBBYEFGS6
sVxJn+3JsCbRp+PhZGOquoJxMB8GA1UdIwQYMBaAFLe40xIF4sIAIR/s0Ek2BxH9
E/bfMIIBIAYDVR0fBIIBFzCCARMwggEPoIIBC6CCAQeGgcZsZGFwOi8vL0NOPVNh
ZmFyaWNvbSUyMEludGVybmFsJTIwSXNzdWluZyUyMENBJTIwMDIsQ049U1ZSTFNB
RkNBMDIsQ049Q0RQLENOPVB1YmxpYyUyMEtleSUyMFNlcnZpY2VzLENOPVNlcnZp
Y2VzLENOPUNvbmZpZ3VyYXRpb24sREM9c2FmYXJpY29tLERDPW5ldD9jZXJ0aWZp
Y2F0ZVJldm9jYXRpb25MaXN0P2Jhc2U/b2JqZWN0Q2xhc3M9Y1JMRGlzdHJpYnV0
aW9uUG9pbnSGPGh0dHA6Ly9jcmwuc2FmYXJpY29tLmNvLmtlL1NhZmFyaWNvbSUy
MElzc3VpbmclMjBDQSUyMDAyLmNybDCCAS4GCCsGAQUFBwEBBIIBIDCCARwwgbsG
CCsGAQUFBzAChoGubGRhcDovLy9DTj1TYWZhcmljb20lMjBJbnRlcm5hbCUyMElz
c3VpbmclMjBDQSUyMDAyLENOPUFJQSxDTj1QdWJsaWMlMjBLZXklMjBTZXJ2aWNl
cyxDTj1TZXJ2aWNlcyxDTj1Db25maWd1cmF0aW9uLERDPXNhZmFyaWNvbSxEQz1u
ZXQ/Y0FDZXJ0aWZpY2F0ZT9iYXNlP29iamVjdENsYXNzPWNlcnRpZmljYXRpb25B
dXRob3JpdHkwXAYIKwYBBQUHMAKGUGh0dHA6Ly9jcmwuc2FmYXJpY29tLmNvLmtl
L1NhZmFyaWNvbSUyMEludGVybmFsJTIwSXNzdWluZyUyMENBJTIwMDIoMikuY3J0
MA4GA1UdDwEB/wQEAwIFoDAPBgkrBgEEAYI3FQEEAgUAMB0GA1UdJQQWMBQGCCsG
AQUFBwMBBggrBgEFBQcDAjAnBgkrBgEEAYI3FQoEGjAYMAoGCCsGAQUFBwMBMAoG
CCsGAQUFBwMCMA0GCSqGSIb3DQEBCwUAA4IBAQBKZCYso3gzq5SRtL5+VWBeYwkX
LoJb9GfFfO9n/IkWJEnqTf+alr8DXJJIj1V8rLazhVPyPNm/Kg6FMi9/0RCSX7PS
Y+AcD1K1BZunWdO6pMOwhErJfJnF8Q0B2xkMnQQ7JMRlUYfDkpN7EM2yeVYNbeEb
QQXwLilF0mz2JyYugZJLa2T2FUbMCqCPRF+HQfYrFdCoLHPBesteOcBKMBGt6IUH
eHVST9CXQOQ/yM0Kkb5f/qaGUQ86jb/YMK7b+zILkzREzeJYLWM7bJnbR4YTiR/
5GT/mGUVkg3qGqb3eEVDGKqUCTIS05XMhjpJZMSaqZ/vUwUvJmTXZeqhLJJn
-----END CERTIFICATE-----`

// Note: Production certificate should be downloaded fresh from Safaricom
// and placed in /certs/ProductionCertificate.cer or embedded here

/**
 * Generate M-Pesa SecurityCredential.
 * Encrypts the initiator password with Safaricom's RSA public key.
 *
 * @param {string} password — your initiator password from M-Pesa portal
 * @param {string} environment — 'sandbox' or 'production'
 * @param {string} certPath — optional: path to a .cer file (for production)
 * @returns {string} base64-encoded encrypted credential
 */
export function generateSecurityCredential(password, environment = 'sandbox', certPath = null) {
  let certificate

  if (certPath) {
    certificate = fs.readFileSync(certPath, 'utf8')
  } else if (environment === 'sandbox') {
    certificate = SANDBOX_CERT
  } else {
    // For production, look for the cert file
    const prodPath = path.resolve(process.cwd(), 'certs', 'ProductionCertificate.cer')
    if (fs.existsSync(prodPath)) {
      certificate = fs.readFileSync(prodPath, 'utf8')
    } else {
      throw new Error(
        'Production certificate not found. Download it from ' +
        'https://developer.safaricom.co.ke/certificates/ProductionCertificate.cer ' +
        'and place it at /certs/ProductionCertificate.cer'
      )
    }
  }

  const encrypted = crypto.publicEncrypt(
    {
      key: certificate,
      padding: crypto.constants.RSA_PKCS1_PADDING, // PKCS #1.5 — NOT OAEP
    },
    Buffer.from(password)
  )

  return encrypted.toString('base64')
}