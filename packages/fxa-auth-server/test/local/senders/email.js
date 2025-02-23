/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const ROOT_DIR = '../../..';

const { assert } = require('chai');
const mocks = require('../../mocks');
const P = require('bluebird');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const config = require(`${ROOT_DIR}/config`).getProperties();
if (!config.smtp.prependVerificationSubdomain.enabled) {
  config.smtp.prependVerificationSubdomain.enabled = true;
}
if (!config.smtp.sesConfigurationSet) {
  config.smtp.sesConfigurationSet = 'ses-config';
}

const TEMPLATE_VERSIONS = require(`${ROOT_DIR}/lib/senders/templates/_versions.json`);

const MESSAGE = {
  acceptLanguage: 'en',
  code: 'abc123',
  deviceId: 'foo',
  location: {
    city: 'Mountain View',
    country: 'USA',
    stateCode: 'CA',
  },
  email: 'a@b.com',
  flowBeginTime: Date.now(),
  flowId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ip: '219.129.234.194',
  locations: [],
  numberRemaining: 2,
  primaryEmail: 'c@d.com',
  productId: 'wibble',
  service: 'sync',
  timeZone: 'America/Los_Angeles',
  tokenCode: 'abc123',
  type: 'secondary',
  uaBrowser: 'Firefox',
  uaBrowserVersion: '70.0a1',
  uaOS: 'Windows',
  uaOSVersion: '10',
  uid: 'uid',
  unblockCode: 'AS6334PK',
};

// key = query param name, value = MESSAGE property name
const MESSAGE_PARAMS = new Map([
  ['code', 'code'],
  ['email', 'email'],
  ['primary_email_verified', 'email'],
  ['product_id', 'productId'],
  ['secondary_email_verified', 'email'],
  ['service', 'service'],
  ['uid', 'uid'],
  ['unblockCode', 'unblockCode'],
]);

const COMMON_TESTS = new Map([
  ['from', { test: 'equal', expected: config.smtp.sender }],
  ['sender', { test: 'equal', expected: config.smtp.sender }],
  [
    'headers',
    new Map([
      ['X-Device-Id', { test: 'equal', expected: MESSAGE.deviceId }],
      ['X-Email-Service', { test: 'equal', expected: 'fxa-auth-server' }],
      ['X-Flow-Begin-Time', { test: 'equal', expected: MESSAGE.flowBeginTime }],
      ['X-Flow-Id', { test: 'equal', expected: MESSAGE.flowId }],
      ['X-Service-Id', { test: 'equal', expected: MESSAGE.service }],
      [
        'X-SES-CONFIGURATION-SET',
        { test: 'equal', expected: config.smtp.sesConfigurationSet },
      ],
      ['X-Uid', { test: 'equal', expected: MESSAGE.uid }],
    ]),
  ],
  [
    'text',
    [
      // Ensure no HTML character entities appear in plaintext emails, &amp; etc
      { test: 'notMatch', expected: /(?:&#x?[0-9a-f]+;)|(?:&[a-z]+;)/i },
    ],
  ],
]);

// prettier-ignore
const TESTS = new Map([
  ['downloadSubscriptionEmail', new Map([
    ['subject', { test: 'equal', expected: 'Welcome to Secure Proxy!' }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('downloadSubscription') }],
      ['X-Template-Name', { test: 'equal', expected: 'downloadSubscription' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.downloadSubscription }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('privacyUrl', 'new-subscription', 'privacy') },
      { test: 'include', expected: configHref('subscriptionDownloadUrl', 'new-subscription', 'download-subscription', 'product_id', 'uid') },
      { test: 'include', expected: configHref('subscriptionSettingsUrl', 'new-subscription', 'cancel-subscription', 'product_id', 'uid') },
      { test: 'include', expected: configHref('subscriptionTermsUrl', 'new-subscription', 'subscription-terms') },
      { test: 'include', expected: configHref('subscriptionSupportUrl', 'new-subscription', 'subscription-support') },
      { test: 'include', expected: 'Welcome to Secure Proxy!' },
      { test: 'include', expected: 'If you haven&#x27;t already downloaded Secure Proxy, let&#x27;s get started using all the features included in your subscription.' },
      { test: 'include', expected: '>Download Secure Proxy</a>' },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Privacy notice:\n${configUrl('privacyUrl', 'new-subscription', 'privacy')}` },
      { test: 'include', expected: configUrl('subscriptionDownloadUrl', 'new-subscription', 'download-subscription', 'product_id', 'uid') },
      { test: 'include', expected: configUrl('subscriptionSettingsUrl', 'new-subscription', 'cancel-subscription', 'product_id', 'uid') },
      { test: 'include', expected: configUrl('subscriptionTermsUrl', 'new-subscription', 'subscription-terms') },
      { test: 'include', expected: configUrl('subscriptionSupportUrl', 'new-subscription', 'subscription-support') },
      { test: 'include', expected: 'Welcome to Secure Proxy!' },
      { test: 'include', expected: 'If you haven\'t already downloaded Secure Proxy, let\'s get started using all the features included in your subscription:' },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['lowRecoveryCodesEmail', new Map([
    ['subject', { test: 'equal', expected: '2 Recovery Codes Remaining' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountRecoveryCodesUrl', 'low-recovery-codes', 'recovery-codes', 'low_recovery_codes=true', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('lowRecoveryCodes') }],
      ['X-Template-Name', { test: 'equal', expected: 'lowRecoveryCodes' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.lowRecoveryCodes }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountRecoveryCodesUrl', 'low-recovery-codes', 'recovery-codes', 'low_recovery_codes=true', 'email', 'uid') },
      { test: 'include', expected: configHref('privacyUrl', 'low-recovery-codes', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'low-recovery-codes', 'support') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Generate codes:\n${configUrl('accountRecoveryCodesUrl', 'low-recovery-codes', 'recovery-codes', 'low_recovery_codes=true', 'email', 'uid')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'low-recovery-codes', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'low-recovery-codes', 'support')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['newDeviceLoginEmail', new Map([
    ['subject', { test: 'equal', expected: 'New Sign-in to Mock Relier' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('initiatePasswordChangeUrl', 'new-device-signin', 'change-password', 'email') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('newDeviceLogin') }],
      ['X-Template-Name', { test: 'equal', expected: 'newDeviceLogin' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.newDeviceLogin }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'new-device-signin', 'manage-account', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'new-device-signin', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'new-device-signin', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'new-device-signin', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'new-device-signin', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `change your password immediately at ${configUrl('initiatePasswordChangeUrl', 'new-device-signin', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'new-device-signin', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'new-device-signin', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['passwordChangedEmail', new Map([
    ['subject', { test: 'equal', expected: 'Password Changed' }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('passwordChanged') }],
      ['X-Template-Name', { test: 'equal', expected: 'passwordChanged' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.passwordChanged }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('initiatePasswordResetUrl', 'password-changed-success', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=') },
      { test: 'include', expected: configHref('privacyUrl', 'password-changed-success', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'password-changed-success', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: configUrl('initiatePasswordResetUrl', 'password-changed-success', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=') },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'password-changed-success', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'password-changed-success', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['passwordResetAccountRecoveryEmail', new Map([
    ['subject', { test: 'equal', expected: 'Password Updated Using Recovery Key' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('createAccountRecoveryUrl', 'password-reset-account-recovery-success', 'create-recovery-key', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('passwordResetAccountRecovery') }],
      ['X-Template-Name', { test: 'equal', expected: 'passwordResetAccountRecovery' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.passwordResetAccountRecovery }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('createAccountRecoveryUrl', 'password-reset-account-recovery-success', 'create-recovery-key', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'password-reset-account-recovery-success', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'password-reset-account-recovery-success', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'password-reset-account-recovery-success', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: configUrl('createAccountRecoveryUrl', 'password-reset-account-recovery-success', 'create-recovery-key', 'email', 'uid') },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'password-reset-account-recovery-success', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'password-reset-account-recovery-success', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'password-reset-account-recovery-success', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['passwordResetEmail', new Map([
    ['subject', { test: 'equal', expected: 'Password Updated' }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('passwordReset') }],
      ['X-Template-Name', { test: 'equal', expected: 'passwordReset' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.passwordReset }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('initiatePasswordResetUrl', 'password-reset-success', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=') },
      { test: 'include', expected: configHref('privacyUrl', 'password-reset-success', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'password-reset-success', 'support') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: configUrl('initiatePasswordResetUrl', 'password-reset-success', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=') },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'password-reset-success', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'password-reset-success', 'support')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['passwordResetRequiredEmail', new Map([
    ['subject', { test: 'equal', expected: 'Suspicious Activity: Password Reset Required' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('initiatePasswordResetUrl', 'password-reset-required', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('passwordResetRequired') }],
      ['X-Template-Name', { test: 'equal', expected: 'passwordResetRequired' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.passwordResetRequired }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('initiatePasswordResetUrl', 'password-reset-required', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=') },
      { test: 'include', expected: configHref('passwordManagerInfoUrl', 'password-reset-required', 'password-info') },
      { test: 'include', expected: configHref('privacyUrl', 'password-reset-required', 'privacy') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: configUrl('initiatePasswordResetUrl', 'password-reset-required', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=') },
      { test: 'include', expected: `Learn how to see what passwords Firefox is storing for you.\n${configUrl('passwordManagerInfoUrl', 'password-reset-required', 'password-info')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'password-reset-required', 'privacy')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postAddAccountRecoveryEmail', new Map([
    ['subject', { test: 'equal', expected: 'Account Recovery Key Generated' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-recovery-generated', 'manage-account', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postAddAccountRecovery') }],
      ['X-Template-Name', { test: 'equal', expected: 'postAddAccountRecovery' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postAddAccountRecovery }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-recovery-generated', 'manage-account', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'account-recovery-generated', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'account-recovery-generated', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-recovery-generated', 'support') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-recovery-generated', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'account-recovery-generated', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-recovery-generated', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-recovery-generated', 'support')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postAddTwoStepAuthenticationEmail', new Map([
    ['subject', { test: 'equal', expected: 'Two-Step Authentication Enabled' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-two-step-enabled', 'manage-account', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postAddTwoStepAuthentication') }],
      ['X-Template-Name', { test: 'equal', expected: 'postAddTwoStepAuthentication' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postAddTwoStepAuthentication }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-two-step-enabled', 'manage-account', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'account-two-step-enabled', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'account-two-step-enabled', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-two-step-enabled', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-two-step-enabled', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'account-two-step-enabled', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-two-step-enabled', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-two-step-enabled', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postChangePrimaryEmail', new Map([
    ['subject', { test: 'equal', expected: 'New Primary Email' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-email-changed', 'account-email-changed', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postChangePrimary') }],
      ['X-Template-Name', { test: 'equal', expected: 'postChangePrimary' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postChangePrimary }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-email-changed', 'account-email-changed', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'account-email-changed', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'account-email-changed', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-email-changed', 'support') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-email-changed', 'account-email-changed', 'email', 'uid')}` },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'account-email-changed', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-email-changed', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-email-changed', 'support')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postConsumeRecoveryCodeEmail', new Map([
    ['subject', { test: 'equal', expected: 'Recovery Code Used' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-consume-recovery-code', 'manage-account', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postConsumeRecoveryCode') }],
      ['X-Template-Name', { test: 'equal', expected: 'postConsumeRecoveryCode' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postConsumeRecoveryCode }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-consume-recovery-code', 'manage-account', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'account-consume-recovery-code', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'account-consume-recovery-code', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-consume-recovery-code', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-consume-recovery-code', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'account-consume-recovery-code', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-consume-recovery-code', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-consume-recovery-code', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postNewRecoveryCodesEmail', new Map([
    ['subject', { test: 'equal', expected: 'New Recovery Codes Generated' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-replace-recovery-codes', 'manage-account', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postNewRecoveryCodes') }],
      ['X-Template-Name', { test: 'equal', expected: 'postNewRecoveryCodes' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postNewRecoveryCodes }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-replace-recovery-codes', 'manage-account', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'account-replace-recovery-codes', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'account-replace-recovery-codes', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-replace-recovery-codes', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-replace-recovery-codes', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'account-replace-recovery-codes', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-replace-recovery-codes', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-replace-recovery-codes', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postRemoveAccountRecoveryEmail', new Map([
    ['subject', { test: 'equal', expected: 'Account Recovery Key Removed' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-recovery-removed', 'manage-account', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postRemoveAccountRecovery') }],
      ['X-Template-Name', { test: 'equal', expected: 'postRemoveAccountRecovery' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postRemoveAccountRecovery }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-recovery-removed', 'manage-account', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'account-recovery-removed', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'account-recovery-removed', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-recovery-removed', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-recovery-removed', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'account-recovery-removed', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-recovery-removed', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-recovery-removed', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postRemoveSecondaryEmail', new Map([
    ['subject', { test: 'equal', expected: 'Secondary Email Removed' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-email-removed', 'account-email-removed', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postRemoveSecondary') }],
      ['X-Template-Name', { test: 'equal', expected: 'postRemoveSecondary' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postRemoveSecondary }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-email-removed', 'account-email-removed', 'email', 'uid') },
      { test: 'include', expected: configHref('privacyUrl', 'account-email-removed', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-email-removed', 'support') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-email-removed', 'account-email-removed', 'email', 'uid')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-email-removed', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-email-removed', 'support')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postRemoveTwoStepAuthenticationEmail', new Map([
    ['subject', { test: 'equal', expected: 'Two-Step Authentication Disabled' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-two-step-disabled', 'manage-account', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postRemoveTwoStepAuthentication') }],
      ['X-Template-Name', { test: 'equal', expected: 'postRemoveTwoStepAuthentication' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postRemoveTwoStepAuthentication }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-two-step-disabled', 'manage-account', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'account-two-step-disabled', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'account-two-step-disabled', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-two-step-disabled', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-two-step-disabled', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'account-two-step-disabled', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-two-step-disabled', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-two-step-disabled', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postVerifyEmail', new Map([
    ['subject', { test: 'equal', expected: 'Account Verified' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('syncUrl', 'account-verified', 'connect-device') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postVerify') }],
      ['X-Template-Name', { test: 'equal', expected: 'postVerify' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postVerify }],
    ])],
    ['html', [
      { test: 'include', expected: `href="${config.smtp.androidUrl}"` },
      { test: 'include', expected: `href="${config.smtp.iosUrl}"` },
      { test: 'include', expected: configHref('privacyUrl', 'account-verified', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-verified', 'support') },
      { test: 'include', expected: configHref('syncUrl', 'account-verified', 'connect-device') },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-verified', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-verified', 'support')}` },
      { test: 'include', expected: `Sign in to Sync:\n${configUrl('syncUrl', 'account-verified', 'connect-device')}` },
      { test: 'notInclude', expected: config.smtp.androidUrl },
      { test: 'notInclude', expected: config.smtp.iosUrl },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['postVerifySecondaryEmail', new Map([
    ['subject', { test: 'equal', expected: 'Secondary Email Added' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-email-verified', 'manage-account', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postVerifySecondary') }],
      ['X-Template-Name', { test: 'equal', expected: 'postVerifySecondary' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postVerifySecondary }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('accountSettingsUrl', 'account-email-verified', 'manage-account', 'email', 'uid') },
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'account-email-verified', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'account-email-verified', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'account-email-verified', 'support') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-email-verified', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'account-email-verified', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-email-verified', 'privacy')}` },
      { test: 'notInclude', expected: config.smtp.supportUrl },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['recoveryEmail', new Map([
    ['subject', { test: 'equal', expected: 'Reset Your Password' }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('recovery') }],
      ['X-Template-Name', { test: 'equal', expected: 'recovery' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.recovery }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('privacyUrl', 'forgot-password', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'forgot-password', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'forgot-password', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'forgot-password', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['unblockCodeEmail', new Map([
    ['subject', { test: 'equal', expected: 'Authorization Code for Firefox' }],
    ['headers', new Map([
      ['X-Report-SignIn-Link', { test: 'equal', expected: configUrl('reportSignInUrl', 'new-unblock', 'report', 'uid', 'unblockCode') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('unblockCode') }],
      ['X-Template-Name', { test: 'equal', expected: 'unblockCode' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.unblockCode }],
      ['X-Unblock-Code', { test: 'equal', expected: MESSAGE.unblockCode }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('privacyUrl', 'new-unblock', 'privacy') },
      { test: 'include', expected: configHref('reportSignInUrl', 'new-unblock', 'report', 'uid', 'unblockCode') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: MESSAGE.unblockCode },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'new-unblock', 'privacy')}` },
      { test: 'include', expected: configUrl('reportSignInUrl', 'new-unblock', 'report', 'uid', 'unblockCode') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: `If yes, here is the authorization code you need: ${MESSAGE.unblockCode}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['verificationReminderFirstEmail', new Map([
    ['subject', { test: 'equal', expected: 'Reminder: Complete Registration' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verificationUrl', 'first-verification-reminder', 'confirm-email', 'code', 'reminder=first', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verificationReminderFirst') }],
      ['X-Template-Name', { test: 'equal', expected: 'verificationReminderFirst' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verificationReminderFirst }],
      ['X-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('privacyUrl', 'first-verification-reminder', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'first-verification-reminder', 'support') },
      { test: 'include', expected: configHref('verificationUrl', 'first-verification-reminder', 'confirm-email', 'code', 'reminder=first', 'uid') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'first-verification-reminder', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'first-verification-reminder', 'support')}` },
      { test: 'include', expected: `Confirm email:\n${configUrl('verificationUrl', 'first-verification-reminder', 'confirm-email', 'code', 'reminder=first', 'uid')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['verificationReminderSecondEmail', new Map([
    ['subject', { test: 'equal', expected: 'Final Reminder: Activate Your Account' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verificationUrl', 'second-verification-reminder', 'confirm-email', 'code', 'reminder=second', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verificationReminderSecond') }],
      ['X-Template-Name', { test: 'equal', expected: 'verificationReminderSecond' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verificationReminderSecond }],
      ['X-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('privacyUrl', 'second-verification-reminder', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'second-verification-reminder', 'support') },
      { test: 'include', expected: configHref('verificationUrl', 'second-verification-reminder', 'confirm-email', 'code', 'reminder=second', 'uid') },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'second-verification-reminder', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'second-verification-reminder', 'support')}` },
      { test: 'include', expected: `Confirm email:\n${configUrl('verificationUrl', 'second-verification-reminder', 'confirm-email', 'code', 'reminder=second', 'uid')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['verifyEmail', new Map([
    ['subject', { test: 'equal', expected: 'Confirm your email and start to sync!' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verificationUrl', 'welcome', 'activate', 'uid', 'code', 'service') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verify') }],
      ['X-Template-Name', { test: 'equal', expected: 'verifySync' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifySync }],
      ['X-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('privacyUrl', 'welcome', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'welcome', 'support') },
      { test: 'include', expected: configHref('verificationUrl', 'welcome', 'activate', 'uid', 'code', 'service') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: 'Ready, set, sync' },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'welcome', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'welcome', 'support')}` },
      { test: 'include', expected: `Verify email: \n${configUrl('verificationUrl', 'welcome', 'activate', 'uid', 'code', 'service')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: 'Ready, set, sync' },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['verifyLoginCodeEmail', new Map([
    ['subject', { test: 'equal', expected: 'Sign-in Code for Mock Relier' }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verifyLoginCode') }],
      ['X-Signin-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
      ['X-Template-Name', { test: 'equal', expected: 'verifyLoginCode' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifyLoginCode }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'new-signin-verify-code', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'new-signin-verify-code', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'new-signin-verify-code', 'support') },
      { test: 'include', expected: MESSAGE.code },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'new-signin-verify-code', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'new-signin-verify-code', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'new-signin-verify-code', 'support')}` },
      { test: 'include', expected: `If yes, here is the verification code: ${MESSAGE.code}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['verifyLoginEmail', new Map([
    ['subject', { test: 'equal', expected: 'Confirm New Sign-in' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verifyLoginUrl', 'new-signin', 'confirm-signin', 'code', 'uid', 'service') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verifyLogin') }],
      ['X-Template-Name', { test: 'equal', expected: 'verifyLogin' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifyLogin }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'new-signin', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'new-signin', 'privacy') },
      { test: 'include', expected: configHref('verifyLoginUrl', 'new-signin', 'confirm-signin', 'code', 'uid', 'service') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'new-signin', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'new-signin', 'privacy')}` },
      { test: 'include', expected: `Confirm sign-in\n${configUrl('verifyLoginUrl', 'new-signin', 'confirm-signin', 'code', 'uid', 'service')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['verifyPrimaryEmail', new Map([
    ['subject', { test: 'equal', expected: 'Verify Primary Email' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verifyPrimaryEmailUrl', 'welcome-primary', 'activate', 'code', 'uid', 'type=primary', 'primary_email_verified', 'service') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verifyPrimary') }],
      ['X-Template-Name', { test: 'equal', expected: 'verifyPrimary' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifyPrimary }],
      ['X-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('initiatePasswordChangeUrl', 'welcome-primary', 'change-password', 'email') },
      { test: 'include', expected: configHref('privacyUrl', 'welcome-primary', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'welcome-primary', 'support') },
      { test: 'include', expected: configHref('verifyPrimaryEmailUrl', 'welcome-primary', 'activate', 'code', 'uid', 'type=primary', 'primary_email_verified', 'service') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `please change your password.\n${configUrl('initiatePasswordChangeUrl', 'welcome-primary', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'welcome-primary', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'welcome-primary', 'support')}` },
      { test: 'include', expected: `Verify email: \n${configUrl('verifyPrimaryEmailUrl', 'welcome-primary', 'activate', 'code', 'uid', 'type=primary', 'primary_email_verified', 'service')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['verifySecondaryEmail', new Map([
    ['subject', { test: 'equal', expected: 'Verify Secondary Email' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verifySecondaryEmailUrl', 'welcome-secondary', 'activate', 'code', 'uid', 'type=secondary', 'secondary_email_verified', 'service') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verifySecondary') }],
      ['X-Template-Name', { test: 'equal', expected: 'verifySecondary' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifySecondary }],
      ['X-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('privacyUrl', 'welcome-secondary', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'welcome-secondary', 'support') },
      { test: 'include', expected: configHref('verifySecondaryEmailUrl', 'welcome-secondary', 'activate', 'code', 'uid', 'type=secondary', 'secondary_email_verified', 'service') },
      { test: 'include', expected: `A request to use ${MESSAGE.email} as a secondary email address has been made from the following Firefox Account` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: MESSAGE.primaryEmail },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'welcome-secondary', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'welcome-secondary', 'support')}` },
      { test: 'include', expected: `Verify email: \n${configUrl('verifySecondaryEmailUrl', 'welcome-secondary', 'activate', 'code', 'uid', 'type=secondary', 'secondary_email_verified', 'service')}` },
      { test: 'include', expected: `A request to use ${MESSAGE.email} as a secondary email address has been made from the following Firefox Account` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: MESSAGE.primaryEmail },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
  ['verifyShortCodeEmail', new Map([
    ['subject', { test: 'equal', expected: `Verification code: ${MESSAGE.code}` }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verify') }],
      ['X-Template-Name', { test: 'equal', expected: 'verifyShortCode' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifyShortCode }],
      ['X-Verify-Short-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: configHref('privacyUrl', 'welcome', 'privacy') },
      { test: 'include', expected: configHref('supportUrl', 'welcome', 'support') },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: 'If yes, use this verification code:' },
      { test: 'include', expected: MESSAGE.code },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'welcome', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'welcome', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `If yes, use this verification code:\n${MESSAGE.code}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
]);

// prettier-ignore
const TRAILHEAD_TESTS = new Map([
  ['postVerifyEmail', new Map([
    ['subject', { test: 'equal', expected: 'Account Confirmed' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: `${config.smtp.syncUrl}?style=trailhead&utm_medium=email&utm_campaign=fx-account-verified&utm_content=fx-connect-device` }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postVerifyTrailhead') }],
      ['X-Template-Name', { test: 'equal', expected: 'postVerifyTrailhead' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postVerifyTrailhead }],
    ])],
    ['html', [
      { test: 'include', expected: `href="${config.smtp.syncUrl}?style=trailhead&utm_medium=email&utm_campaign=fx-account-verified&utm_content=fx-connect-device"` },
      { test: 'include', expected: 'You&#x27;re signed in and ready to start exploring safely and securely.' },
    ]],
    ['text', [
      { test: 'include', expected: `${config.smtp.syncUrl}?style=trailhead&utm_medium=email&utm_campaign=fx-account-verified&utm_content=fx-connect-device` },
      { test: 'include', expected: 'You\'re signed in and ready to start exploring safely and securely.' },
    ]],
  ])],
  ['verifyEmail', new Map([
    ['subject', { test: 'equal', expected: 'Finish Creating Your Account' }],
    ['headers', new Map([
      ['X-Link', { test: 'include', expected: '&style=trailhead&' }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verifyTrailhead') }],
      ['X-Template-Name', { test: 'equal', expected: 'verifyTrailhead' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifyTrailhead }],
    ])],
    ['html', [
      { test: 'include', expected: 'Confirm your account and get the most out of Firefox everywhere you sign in.' },
      { test: 'include', expected: '&style=trailhead&' },
    ]],
    ['text', [
      { test: 'include', expected: 'Confirm your account and get the most out of Firefox everywhere you sign in.' },
      { test: 'include', expected: '&style=trailhead&' },
    ]],
  ])],
]);

describe('lib/senders/email:', () => {
  let mockLog, mailer, localize, selectEmailServices, sendMail;

  before(async () => {
    mockLog = mocks.mockLog();
    mailer = await setup(mockLog, config, {
      './oauth_client_info': () => ({
        async fetch() {
          return { name: 'Mock Relier' };
        },
      }),
    });
    // These tests do a lot of ad hoc mocking. Rather than try and clean up
    // after each case, give them carte blanche to do what they want then
    // restore the original methods in the top-level afterEach.
    localize = mailer.localize;
    selectEmailServices = mailer.selectEmailServices;
    sendMail = {
      mailer: mailer.mailer.sendMail,
      emailService: mailer.emailService.sendMail,
    };
  });

  after(() => mailer.stop());

  afterEach(() => {
    Object.values(mockLog).forEach(fn => {
      if (typeof fn === 'function') {
        fn.resetHistory();
      }
    });
    if (mailer.localize !== localize) {
      mailer.localize = localize;
    }
    if (mailer.selectEmailServices !== selectEmailServices) {
      mailer.selectEmailServices = selectEmailServices;
    }
    if (mailer.mailer.sendMail !== sendMail.mailer) {
      mailer.mailer.sendMail = sendMail.mailer;
    }
    if (mailer.emailService.sendMail !== sendMail.emailService) {
      mailer.emailService.sendMail = sendMail.emailService;
    }
  });

  it('mailer and emailService are not mocked', () => {
    assert.isObject(mailer.mailer);
    assert.isFunction(mailer.mailer.sendMail);
    assert.isObject(mailer.emailService);
    assert.isFunction(mailer.emailService.sendMail);
    assert.notEqual(mailer.mailer, mailer.emailService);
  });

  it('declarative tests', async () => {
    for (const [type, test] of TESTS) {
      mailer.mailer.sendMail = stubSendMail(message => {
        COMMON_TESTS.forEach((assertions, property) => {
          applyAssertions(type, message, property, assertions);
        });

        test.forEach((assertions, property) => {
          applyAssertions(type, message, property, assertions);
        });
      });

      await mailer[type](MESSAGE);
    }

    for (const [type, test] of TRAILHEAD_TESTS) {
      mailer.mailer.sendMail = stubSendMail(message => {
        test.forEach((assertions, property) => {
          applyAssertions(type, message, property, assertions);
        });
      });

      return mailer[type]({ ...MESSAGE, style: 'trailhead' });
    }
  });

  it('verifyEmail handles no service', () => {
    mailer.mailer.sendMail = stubSendMail(message => {
      assert.include(message.html, 'Welcome!');
      assert.notInclude(message.html, 'Welcome to');

      assert.include(message.text, 'Welcome!');
      assert.notInclude(message.text, 'Welcome to');

      assert.include(message.html, 'activate your Firefox Account.');
      assert.notInclude(
        message.html,
        'activate your Firefox Account and continue to'
      );

      assert.include(message.text, 'activate your Firefox Account.');
      assert.notInclude(
        message.text,
        'activate your Firefox Account and continue to'
      );
    });

    return mailer.verifyEmail({ ...MESSAGE, service: null });
  });

  it('formats user-agent strings sanely', () => {
    let result = mailer._formatUserAgentInfo({
      uaBrowser: 'Firefox',
      uaBrowserVersion: '70',
      uaOS: 'Windows',
      uaOSVersion: '10',
    });
    assert.equal(result, 'Firefox on Windows 10');

    result = mailer._formatUserAgentInfo({
      uaBrowserVersion: '70',
      uaOS: 'Windows',
      uaOSVersion: '10',
    });
    assert.equal(result, 'Windows 10');

    result = mailer._formatUserAgentInfo({
      uaBrowser: 'Firefox',
      uaBrowserVersion: '70',
      uaOS: 'Windows',
    });
    assert.equal(result, 'Firefox on Windows');

    result = mailer._formatUserAgentInfo({
      uaBrowser: 'Firefox',
      uaBrowserVersion: '70',
      uaOSVersion: '10',
    });
    assert.equal(result, 'Firefox');

    result = mailer._formatUserAgentInfo({
      uaBrowser: 'Firefox',
      uaBrowserVersion: '70',
    });
    assert.equal(result, 'Firefox');

    result = mailer._formatUserAgentInfo({ uaOS: 'Windows' });
    assert.equal(result, 'Windows');

    result = mailer._formatUserAgentInfo({});
    assert.equal(result, '');

    result = mailer._formatUserAgentInfo({
      uaBrowser: '<a>Firefox</a>',
      uaBrowserVersion: '70',
      uaOS: 'Windows',
      uaOSVersion: '10',
    });
    assert.equal(result, 'Windows 10');

    result = mailer._formatUserAgentInfo({
      uaBrowser: 'Firefox',
      uaBrowserVersion: '70',
      uaOS: 'http://example.com/',
      uaOSVersion: '10',
    });
    assert.equal(result, 'Firefox');

    result = mailer._formatUserAgentInfo({
      uaBrowser: 'Firefox',
      uaBrowserVersion: '70',
      uaOS: 'Windows',
      uaOSVersion: 'dodgy-looking',
    });
    assert.equal(result, 'Firefox on Windows');
  });

  it('formats location strings sanely', () => {
    const localMessage = {
      ...MESSAGE,
      location: {
        city: 'Bournemouth',
        state: 'England',
        stateCode: 'EN',
        country: 'United Kingdom',
        countryCode: 'GB',
      },
    };
    assert.equal(
      mailer._constructLocationString(localMessage),
      'Bournemouth, EN, United Kingdom (estimated)'
    );

    localMessage.location.stateCode = null;
    assert.equal(
      mailer._constructLocationString(localMessage),
      'Bournemouth, United Kingdom (estimated)'
    );

    localMessage.location.city = null;
    localMessage.location.stateCode = 'EN';
    assert.equal(
      mailer._constructLocationString(localMessage),
      'EN, United Kingdom (estimated)'
    );

    localMessage.location.stateCode = null;
    assert.equal(
      mailer._constructLocationString(localMessage),
      'United Kingdom (estimated)'
    );

    localMessage.location = null;
    assert.equal(mailer._constructLocationString(localMessage), '');
  });

  it('defaults X-Template-Version to 1', () => {
    mailer.localize = () => ({});
    mailer.mailer.sendMail = stubSendMail(emailConfig => {
      assert.equal(emailConfig.headers['X-Template-Version'], 1);
    });
    return mailer.send({
      ...MESSAGE,
      template: 'wibble-blee-definitely-does-not-exist',
    });
  });

  describe('mock sendMail method:', () => {
    beforeEach(() => {
      mailer.localize = () => ({ language: 'en' });
      sinon.stub(mailer.mailer, 'sendMail').callsFake((config, cb) => {
        cb(null, { resp: 'ok' });
      });
    });

    it('resolves sendMail status', () => {
      const message = {
        email: 'test@restmail.net',
        subject: 'subject',
        template: 'verifyLogin',
        uid: 'foo',
      };

      return mailer.send(message).then(status => {
        assert.deepEqual(status, [{ resp: 'ok' }]);
      });
    });

    it('logs emailEvent on send', () => {
      const message = {
        email: 'test@restmail.net',
        flowId: 'wibble',
        subject: 'subject',
        template: 'verifyLogin',
        uid: 'foo',
      };

      return mailer.send(message).then(() => {
        assert.equal(mockLog.info.callCount, 3);
        const emailEventLog = mockLog.info.getCalls()[2];
        assert.equal(emailEventLog.args[0], 'emailEvent');
        assert.equal(emailEventLog.args[1].domain, 'other');
        assert.equal(emailEventLog.args[1].flow_id, 'wibble');
        assert.equal(emailEventLog.args[1].template, 'verifyLogin');
        assert.equal(emailEventLog.args[1].type, 'sent');
        assert.equal(emailEventLog.args[1].locale, 'en');
        const mailerSend1 = mockLog.info.getCalls()[1];
        assert.equal(mailerSend1.args[0], 'mailer.send.1');
        assert.equal(mailerSend1.args[1].to, message.email);
      });
    });
  });

  describe('mock failing sendMail method:', () => {
    beforeEach(() => {
      mailer.localize = () => ({});
      sinon
        .stub(mailer.mailer, 'sendMail')
        .callsFake((config, cb) => cb(new Error('Fail')));
    });

    it('rejects sendMail status', () => {
      const message = {
        email: 'test@restmail.net',
        subject: 'subject',
        template: 'verifyLogin',
        uid: 'foo',
      };

      return mailer.send(message).then(assert.notOk, err => {
        assert.equal(err.message, 'Fail');
      });
    });
  });

  describe('sends request to the right mailer', () => {
    beforeEach(() => {
      sinon.stub(mailer.mailer, 'sendMail').callsFake((config, cb) => {
        cb(null, { resp: 'whatevs' });
      });
      sinon.stub(mailer.emailService, 'sendMail').callsFake((config, cb) => {
        cb(null, { resp: 'whatevs' });
      });
    });

    it('sends request to fxa-email-service when the email pattern is right', () => {
      const message = {
        email: 'emailservice.foo@restmail.net',
        subject: 'subject',
        template: 'verifyLogin',
        templateValues: {
          action: 'action',
          clientName: 'clientName',
          device: 'device',
          email: 'emailservice.foo@restmail.net',
          ip: 'ip',
          link: 'link',
          location: 'location',
          oneClickLink: 'oneClickLink',
          passwordChangeLink: 'passwordChangeLink',
          passwordChangeLinkAttributes: 'passwordChangeLinkAttributes',
          privacyUrl: 'privacyUrl',
          subject: 'subject',
          supportLinkAttributes: 'supportLinkAttributes',
          supportUrl: 'supportUrl',
          timestamp: 'timestamp',
        },
        uid: 'foo',
      };
      mailer.sesConfigurationSet = 'wibble';

      return mailer.send(message).then(response => {
        assert(mailer.emailService.sendMail.calledOnce);
        assert(!mailer.mailer.sendMail.called);

        const args = mailer.emailService.sendMail.args[0];

        assert.equal(args.length, 2);
        assert.equal(args[0].to, 'emailservice.foo@restmail.net');
        assert.equal(args[0].subject, 'subject');
        assert.equal(args[0].provider, 'ses');

        const headers = args[0].headers;

        assert.equal(headers['X-Template-Name'], 'verifyLogin');
        assert.equal(headers['X-Email-Service'], 'fxa-email-service');
        assert.equal(headers['X-Email-Sender'], 'ses');
        assert.equal(headers['X-Uid'], 'foo');

        const expectedSesMessageTags = sesMessageTagsHeaderValue(
          message.template,
          'fxa-email-service'
        );
        assert.equal(headers['X-SES-MESSAGE-TAGS'], expectedSesMessageTags);
        assert.equal(headers['X-SES-CONFIGURATION-SET'], 'wibble');

        assert.equal(typeof args[1], 'function');
      });
    });

    it("doesn't send request to fxa-email-service when the email pattern is not right", () => {
      const message = {
        email: 'foo@restmail.net',
        subject: 'subject',
        template: 'verifyLogin',
        templateValues: {
          action: 'action',
          clientName: 'clientName',
          device: 'device',
          email: 'emailservice.foo@restmail.net',
          ip: 'ip',
          link: 'link',
          location: 'location',
          oneClickLink: 'oneClickLink',
          passwordChangeLink: 'passwordChangeLink',
          passwordChangeLinkAttributes: 'passwordChangeLinkAttributes',
          privacyUrl: 'privacyUrl',
          subject: 'subject',
          supportLinkAttributes: 'supportLinkAttributes',
          supportUrl: 'supportUrl',
          timestamp: 'timestamp',
        },
        uid: 'foo',
      };

      return mailer.send(message).then(response => {
        assert(!mailer.emailService.sendMail.called);
        assert(mailer.mailer.sendMail.calledOnce);
        const args = mailer.mailer.sendMail.args[0];
        assert.equal(args.length, 2);
        assert.equal(args[0].to, 'foo@restmail.net');
        assert.equal(args[0].subject, 'subject');
        assert.equal(args[0].headers['X-Template-Name'], 'verifyLogin');
        assert.equal(args[0].headers['X-Uid'], 'foo');
        assert.equal(args[0].provider, undefined);
        assert.equal(typeof mailer.mailer.sendMail.args[0][1], 'function');
      });
    });

    it('sends request to fxa-email-service when selectEmailServices tells it to', () => {
      const message = {
        email: 'foo@example.com',
        subject: 'subject',
        template: 'verifyLogin',
        templateValues: {
          action: 'action',
          clientName: 'clientName',
          device: 'device',
          email: 'emailservice.foo@restmail.net',
          ip: 'ip',
          link: 'link',
          location: 'location',
          oneClickLink: 'oneClickLink',
          passwordChangeLink: 'passwordChangeLink',
          passwordChangeLinkAttributes: 'passwordChangeLinkAttributes',
          privacyUrl: 'privacyUrl',
          subject: 'subject',
          supportLinkAttributes: 'supportLinkAttributes',
          supportUrl: 'supportUrl',
          timestamp: 'timestamp',
        },
      };
      mailer.selectEmailServices = sinon.spy(() =>
        P.resolve([
          {
            emailAddresses: [message.email],
            emailService: 'fxa-email-service',
            emailSender: 'sendgrid',
            mailer: mailer.emailService,
          },
        ])
      );

      return mailer.send(message).then(() => {
        assert.equal(mailer.selectEmailServices.callCount, 1);

        let args = mailer.selectEmailServices.args[0];
        assert.equal(args.length, 1);
        assert.equal(args[0], message);

        assert.equal(mailer.emailService.sendMail.callCount, 1);
        assert.equal(mailer.mailer.sendMail.callCount, 0);

        args = mailer.emailService.sendMail.args[0];
        assert.equal(args.length, 2);
        assert.equal(args[0].to, 'foo@example.com');
        assert.equal(args[0].provider, 'sendgrid');

        const headers = args[0].headers;
        assert.equal(headers['X-Email-Service'], 'fxa-email-service');
        assert.equal(headers['X-Email-Sender'], 'sendgrid');
      });
    });

    it('correctly handles multiple email addresses from selectEmailServices', () => {
      const message = {
        email: 'foo@example.com',
        ccEmails: ['bar@example.com', 'baz@example.com'],
        subject: 'subject',
        template: 'verifyLogin',
        templateValues: {
          action: 'action',
          clientName: 'clientName',
          device: 'device',
          email: 'emailservice.foo@restmail.net',
          ip: 'ip',
          link: 'link',
          location: 'location',
          oneClickLink: 'oneClickLink',
          passwordChangeLink: 'passwordChangeLink',
          passwordChangeLinkAttributes: 'passwordChangeLinkAttributes',
          privacyUrl: 'privacyUrl',
          subject: 'subject',
          supportLinkAttributes: 'supportLinkAttributes',
          supportUrl: 'supportUrl',
          timestamp: 'timestamp',
        },
      };
      mailer.selectEmailServices = sinon.spy(() =>
        P.resolve([
          {
            emailAddresses: [message.email, ...message.ccEmails],
            emailService: 'fxa-auth-server',
            emailSender: 'ses',
            mailer: mailer.mailer,
          },
        ])
      );

      return mailer.send(message).then(() => {
        assert.equal(mailer.selectEmailServices.callCount, 1);
        assert.equal(mailer.mailer.sendMail.callCount, 1);
        assert.equal(mailer.emailService.sendMail.callCount, 0);

        const args = mailer.mailer.sendMail.args[0];
        assert.equal(args.length, 2);
        assert.equal(args[0].to, 'foo@example.com');
        assert.deepEqual(args[0].cc, ['bar@example.com', 'baz@example.com']);

        const headers = args[0].headers;
        assert.equal(headers['X-Email-Service'], 'fxa-auth-server');
        assert.equal(headers['X-Email-Sender'], 'ses');
      });
    });

    it('correctly handles multiple services from selectEmailServices', () => {
      const message = {
        email: 'foo@example.com',
        ccEmails: ['bar@example.com', 'baz@example.com'],
        subject: 'subject',
        template: 'verifyLogin',
        templateValues: {
          action: 'action',
          clientName: 'clientName',
          device: 'device',
          email: 'emailservice.foo@restmail.net',
          ip: 'ip',
          link: 'link',
          location: 'location',
          oneClickLink: 'oneClickLink',
          passwordChangeLink: 'passwordChangeLink',
          passwordChangeLinkAttributes: 'passwordChangeLinkAttributes',
          privacyUrl: 'privacyUrl',
          subject: 'subject',
          supportLinkAttributes: 'supportLinkAttributes',
          supportUrl: 'supportUrl',
          timestamp: 'timestamp',
        },
      };
      mailer.selectEmailServices = sinon.spy(() =>
        P.resolve([
          {
            emailAddresses: [message.email],
            emailService: 'fxa-email-service',
            emailSender: 'sendgrid',
            mailer: mailer.emailService,
          },
          {
            emailAddresses: message.ccEmails.slice(0, 1),
            emailService: 'fxa-email-service',
            emailSender: 'ses',
            mailer: mailer.emailService,
          },
          {
            emailAddresses: message.ccEmails.slice(1),
            emailService: 'fxa-auth-server',
            emailSender: 'ses',
            mailer: mailer.mailer,
          },
        ])
      );

      return mailer.send(message).then(() => {
        assert.equal(mailer.selectEmailServices.callCount, 1);
        assert.equal(mailer.emailService.sendMail.callCount, 2);
        assert.equal(mailer.mailer.sendMail.callCount, 1);

        let args = mailer.emailService.sendMail.args[0];
        assert.equal(args.length, 2);
        assert.equal(args[0].to, 'foo@example.com');
        assert.equal(args[0].cc, undefined);
        assert.equal(args[0].provider, 'sendgrid');

        let headers = args[0].headers;
        assert.equal(headers['X-Email-Service'], 'fxa-email-service');
        assert.equal(headers['X-Email-Sender'], 'sendgrid');

        args = mailer.emailService.sendMail.args[1];
        assert.equal(args.length, 2);
        assert.equal(args[0].to, 'bar@example.com');
        assert.equal(args[0].cc, undefined);
        assert.equal(args[0].provider, 'ses');

        headers = args[0].headers;
        assert.equal(headers['X-Email-Service'], 'fxa-email-service');
        assert.equal(headers['X-Email-Sender'], 'ses');

        args = mailer.mailer.sendMail.args[0];
        assert.equal(args.length, 2);
        assert.equal(args[0].to, 'baz@example.com');
        assert.equal(args[0].cc, undefined);
        assert.equal(args[0].provider, undefined);

        headers = args[0].headers;
        assert.equal(headers['X-Email-Service'], 'fxa-auth-server');
        assert.equal(headers['X-Email-Sender'], 'ses');
      });
    });
  });
});

describe('mailer constructor:', () => {
  let mailerConfig, mockLog, mailer;

  before(async () => {
    mailerConfig = [
      'accountSettingsUrl',
      'accountRecoveryCodesUrl',
      'androidUrl',
      'initiatePasswordChangeUrl',
      'initiatePasswordResetUrl',
      'iosUrl',
      'iosAdjustUrl',
      'passwordManagerInfoUrl',
      'passwordResetUrl',
      'privacyUrl',
      'reportSignInUrl',
      'sender',
      'sesConfigurationSet',
      'supportUrl',
      'syncUrl',
      'verificationUrl',
      'verifyLoginUrl',
      'verifySecondaryEmailUrl',
      'verifyPrimaryEmailUrl',
    ].reduce((target, key) => {
      target[key] = `mock ${key}`;
      return target;
    }, {});
    mockLog = mocks.mockLog();
    mailer = await setup(
      mockLog,
      { ...config, smtp: mailerConfig },
      {},
      'en',
      'wibble'
    );
  });

  it('mailer and emailService are both mocked', () => {
    assert.equal(mailer.mailer, 'wibble');
    assert.equal(mailer.emailService, 'wibble');
  });

  it('set properties on self from config correctly', () => {
    Object.entries(mailerConfig).forEach(([key, expected]) => {
      assert.equal(mailer[key], expected, `${key} was correct`);
    });
  });
});

describe('email translations', () => {
  let mockLog, mailer;
  const message = {
    email: 'a@b.com',
  };

  async function setupMailerWithTranslations(locale) {
    mockLog = mocks.mockLog();
    mailer = await setup(mockLog, config, {}, locale);
  }

  afterEach(() => mailer.stop());

  it('arabic emails are translated', async () => {
    await setupMailerWithTranslations('ar');
    mailer.mailer.sendMail = stubSendMail(emailConfig => {
      assert.equal(
        emailConfig.headers['Content-Language'],
        'ar',
        'language header is correct'
      );
      // NOTE: translation might change, but we use the subject, we don't change that often.
      // TODO: switch back to testing the subject when translations have caught up
      assert.include(emailConfig.text, 'سياسة موزيلا للخصوصيّة');
    });

    return mailer.verifyEmail(message);
  });

  it('russian emails are translated', async () => {
    await setupMailerWithTranslations('ru');
    mailer.mailer.sendMail = stubSendMail(emailConfig => {
      assert.equal(
        emailConfig.headers['Content-Language'],
        'ru',
        'language header is correct'
      );
      // NOTE: translation might change, but we use the subject, we don't change that often.
      assert.equal(emailConfig.subject, 'Завершите создание вашего Аккаунта');
    });

    return mailer.verifyEmail({
      ...message,
      style: 'trailhead',
    });
  });
});

function sesMessageTagsHeaderValue(templateName, serviceName) {
  return `messageType=fxa-${templateName}, app=fxa, service=${serviceName ||
    'fxa-auth-server'}`;
}

function configHref(key, campaign, content, ...params) {
  return `href="${configUrl(key, campaign, content, ...params)}"`;
}

function configUrl(key, campaign, content, ...params) {
  let baseUri = config.smtp[key];

  if (key === 'verificationUrl' || key === 'verifyLoginUrl') {
    baseUri = baseUri.replace(
      '//',
      `//${config.smtp.prependVerificationSubdomain.subdomain}.`
    );
  }

  let fragmentId = '';

  if (baseUri.indexOf('#') > -1) {
    // Split the frag id so we can append it after query string
    [baseUri, fragmentId] = baseUri.split('#');
    fragmentId = `#${fragmentId}`;
  }

  const paramsString = params
    .map(key => {
      if (key.indexOf('=') > -1) {
        // Short-circuit params that were already passed in with a value
        return `${key}&`;
      }

      let param = `${key}=`;
      if (MESSAGE_PARAMS.has(key)) {
        // Populate params without a value using `MESSAGE`
        param += encodeURIComponent(MESSAGE[MESSAGE_PARAMS.get(key)]);
      }
      return `${param}&`;
    })
    .join('');

  return `${baseUri}?${paramsString}utm_medium=email&utm_campaign=fx-${campaign}&utm_content=fx-${content}${fragmentId}`;
}

async function setup(log, config, mocks, locale = 'en', sender = null) {
  const [translator, templates] = await P.all([
    require(`${ROOT_DIR}/lib/senders/translator`)([locale], locale),
    require(`${ROOT_DIR}/lib/senders/templates`)(log),
  ]);
  const Mailer = proxyquire(`${ROOT_DIR}/lib/senders/email`, mocks)(
    log,
    config
  );
  return new Mailer(translator, templates, config.smtp, sender);
}

function stubSendMail(stub, status) {
  return (message, callback) => {
    try {
      stub(message);
      return callback(null, status);
    } catch (err) {
      return callback(err, status);
    }
  };
}

function applyAssertions(type, target, property, assertions) {
  target = target[property];

  if (assertions instanceof Map) {
    assertions.forEach((nestedAssertions, nestedProperty) => {
      applyAssertions(type, target, nestedProperty, nestedAssertions);
    });
    return;
  }

  if (!Array.isArray(assertions)) {
    assertions = [assertions];
  }

  assertions.forEach(({ test, expected }) => {
    assert[test](target, expected, `${type}: ${property}`);
  });
}
