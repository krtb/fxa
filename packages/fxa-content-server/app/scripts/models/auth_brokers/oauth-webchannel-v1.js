/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * WebChannel OAuth broker that speaks "v1" of the protocol.
 */

import _ from 'underscore';
import WebChannel from '../../lib/channels/web';
import Constants from '../../lib/constants';
import HaltIfBrowserTransitions from '../../views/behaviors/halt-if-browser-transitions';
import FxSyncWebChannelAuthenticationBroker from './fx-sync-web-channel';
import Url from '../../lib/url';
import AuthErrors from '../../lib/auth-errors';
import OAuthErrors from '../../lib/oauth-errors';
import Transform from '../../lib/transform';
import Vat from '../../lib/vat';

const proto = FxSyncWebChannelAuthenticationBroker.prototype;
const defaultBehaviors = proto.defaultBehaviors;

const OAUTH_CODE_RESPONSE_SCHEMA = {
  code: Vat.oauthCode().required(),
  state: Vat.string(),
};

/**
 * Invoke `brokerMethod` on the broker and finish the OAuth flow by
 * invoking `finishMethod` if verifying in the original tab. If verifying
 * in another tab, the default behavior is returned.
 *
 * @param {String} brokerMethod
 * @param {String} finishMethod
 * @returns {Promise}
 */
function finishOAuthFlowIfOriginalTab(brokerMethod, finishMethod) {
  return function(account) {
    // The user may have replaced the original tab with the verification
    // tab. If this is the case, send the OAuth result to the RP.
    //
    // The slight delay is to allow the functional tests time to bind
    // event handlers before the flow completes.
    return proto[brokerMethod]
      .call(this, account)
      .then(behavior => {
        return p.delay(this.DELAY_BROKER_RESPONSE_MS).then(() => behavior);
      })
      .then(behavior => {
        if (this.isOriginalTab()) {
          return this[finishMethod](account).then(() => new HaltBehavior());
        }
        return behavior;
      });
  };
}

const OAuthWebChannelBroker = FxSyncWebChannelAuthenticationBroker.extend({
  defaultBehaviors: _.extend({}, defaultBehaviors, {
    // afterForceAuth: new HaltIfBrowserTransitions(
    //   defaultBehaviors.afterForceAuth
    // ),
    // afterResetPasswordConfirmationPoll: new HaltIfBrowserTransitions(
    //   defaultBehaviors.afterResetPasswordConfirmationPoll
    // ),
    // afterSignIn: new HaltIfBrowserTransitions(defaultBehaviors.afterSignIn),
    // afterSignInConfirmationPoll: new HaltIfBrowserTransitions(
    //   defaultBehaviors.afterSignInConfirmationPoll
    // ),
    // afterSignUpConfirmationPoll: new HaltIfBrowserTransitions(
    //   defaultBehaviors.afterSignUpConfirmationPoll
    // ),
  }),

  defaultCapabilities: _.extend({}, proto.defaultCapabilities, {
    chooseWhatToSyncCheckbox: false,
    chooseWhatToSyncWebV1: false,
    fxaStatus: true,
    openWebmailButtonVisible: false,
    sendAfterSignUpConfirmationPollNotice: true,
  }),

  commands: _.pick(
    WebChannel,
    'CAN_LINK_ACCOUNT',
    'CHANGE_PASSWORD',
    'DELETE_ACCOUNT',
    'LOADED',
    'LOGIN',
    'VERIFIED'
  ),

  type: 'oauth-webchannel-v1',

  afterCompleteResetPassword(account) {
    // This method is not in the fx-sync-channel because only the initiating
    // tab can send a login message for fx-desktop-v1 and it's descendents.
    // Messages from other tabs are ignored.
    return Promise.resolve()
      .then(() => {
        if (
          account.get('verified') &&
          !account.get('verificationReason') &&
          !account.get('verificationMethod')
        ) {
          // only notify the browser of the login if the user does not have
          // to verify their account/session
          return this._notifyRelierOfLogin(account);
        }
      })
      .then(() => proto.afterCompleteResetPassword.call(this, account));
  },

  afterCompleteSignInWithCode(account) {
    return this._notifyRelierOfLogin(account).then(() =>
      proto.afterSignInConfirmationPoll.call(this, account)
    );
  },

  beforeSignUpConfirmationPoll(account) {
    debugger;
    // The Sync broker notifies the browser of an unverified login
    // before the user has verified their email. This allows the user
    // to close the original tab or open the verification link in
    // the about:accounts tab and have Sync still successfully start.
    return this._notifyRelierOfLogin(account).then(() =>
      proto.beforeSignUpConfirmationPoll.call(this, account)
    );
  },

  /**
   * Finish the OAuth flow.
   *
   * @param {Object} [result] - state sent by OAuth RP
   * @param {String} [result.state] - state sent by OAuth RP
   * @param {String} [result.code] - OAuth code generated by the OAuth server
   * @param {String} [result.redirect] - URL that can be used to redirect to
   * the RP.
   *
   * @returns {Promise}
   */

  finishOAuthSignInFlow(account) {
    return this.finishOAuthFlow(account, {
      action: Constants.OAUTH_ACTION_SIGNIN,
    });
  },

  finishOAuthSignUpFlow(account) {
    return this.finishOAuthFlow(account, {
      action: Constants.OAUTH_ACTION_SIGNUP,
    });
  },

  sendOAuthResultToRelier(result) {
    return this._metrics.flush().then(() => {
      var extraParams = {};
      if (result.error) {
        extraParams['error'] = result.error;
      }
      if (result.action) {
        extraParams['action'] = result.action;
      }
      return this.send(this.getCommand('LOGIN'), result);
    });
  },

  finishOAuthFlow(account, additionalResultData = {}) {
    this.session.clear('oauth');

    return Promise.resolve().then(() => {
      // There are no ill side effects if the Original Tab Marker is
      // cleared in the a tab other than the original. Always clear it just
      // to make sure the bases are covered.
      this.clearOriginalTabMarker();
      return this.getOAuthResult(account).then(result => {
        result = _.extend(result, additionalResultData);
        return this.sendOAuthResultToRelier(result);
      });
    });
  },

  getOAuthResult(account) {
    if (!account || !account.get('sessionToken')) {
      return Promise.reject(AuthErrors.toError('INVALID_TOKEN'));
    }
    const relier = this.relier;
    const clientId = relier.get('clientId');
    return Promise.resolve()
      .then(() => {
        if (relier.wantsKeys()) {
          return this._provisionScopedKeys(account);
        }
      })
      .then(keysJwe => {
        /* eslint-disable camelcase */
        const oauthParams = {
          acr_values: relier.get('acrValues'),
          code_challenge: relier.get('codeChallenge'),
          code_challenge_method: relier.get('codeChallengeMethod'),
          scope: relier.get('scope'),
        };
        /* eslint-enable camelcase */

        if (keysJwe) {
          oauthParams.keys_jwe = keysJwe; //eslint-disable-line camelcase
        }

        if (relier.get('accessType') === Constants.ACCESS_TYPE_OFFLINE) {
          oauthParams.access_type = Constants.ACCESS_TYPE_OFFLINE; //eslint-disable-line camelcase
        }

        return account.createOAuthCode(
          clientId,
          relier.get('state'),
          oauthParams
        );
      })
      .then(response => {
        if (!response) {
          return Promise.reject(OAuthErrors.toError('INVALID_RESULT'));
        }
        // The oauth-server would previously construct and return the full redirect URI,
        // but we now expect to receive `code` and `state` and build it ourselves
        // using the relier's locally-validated redirectUri.
        delete response.redirect;
        const result = Transform.transformUsingSchema(
          response,
          OAUTH_CODE_RESPONSE_SCHEMA,
          OAuthErrors
        );
        result.redirect = Url.updateSearchString(relier.get('redirectUri'), {
          code: result.code,
          state: result.state,
        });
        return result;
      });
  },

  afterSignUpConfirmationPoll(account) {
    const additionalResultData = {};
    return this.getOAuthResult(account).then(result => {
      result = _.extend(result, additionalResultData);
      return this.sendOAuthResultToRelier(result);
    });
  },

  afterCompleteSignUp: finishOAuthFlowIfOriginalTab(
    'afterCompleteSignUp',
    'finishOAuthSignUpFlow'
  ),
});

export default OAuthWebChannelBroker;
