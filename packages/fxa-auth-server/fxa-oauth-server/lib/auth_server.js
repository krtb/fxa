/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const createBackendServiceAPI = require('../../lib/backendService');
const Joi = require('joi');

module.exports = (log, config) => {
  const AuthServerAPI = createBackendServiceAPI(log, config, 'auth', {
    getUserProfile: {
      path: '/v1/account/profile',
      method: 'GET',
      validate: {
        query: {
          client_id: Joi.string().required(),
          scope: Joi.string().required(),
          uid: Joi.string().required(),
        },
        response: {
          email: Joi.string().optional(),
          locale: Joi.string()
            .optional()
            .allow(null),
          authenticationMethods: Joi.array()
            .items(Joi.string().required())
            .optional(),
          authenticatorAssuranceLevel: Joi.number().min(0),
          subscriptions: Joi.array()
            .items(Joi.string().required())
            .optional(),
          profileChangedAt: Joi.number().min(0),
        },
      },
    },
  });

  const api = new AuthServerAPI(config.auth.url, {
    ...config.auth.poolee,
    headers: {
      authorization: config.auth.sharedSecret,
    },
  });

  return {
    api,

    close() {
      api.close();
    },

    async getUserProfile({ client_id, scope, uid }) {
      try {
        return await api.getUserProfile({
          client_id,
          scope,
          uid,
        });
      } catch (err) {
        throw mapAuthError(log, err);
      }
    },
  };
};

function mapAuthError(log, err) {
  throw err;
}
