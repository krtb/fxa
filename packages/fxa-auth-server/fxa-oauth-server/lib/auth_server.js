/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const createBackendServiceAPI = require('../../lib/backendService');
const Joi = require('joi');

module.exports = (log, config) => {
  const AuthServerAPI = createBackendServiceAPI(log, config, 'auth', {
    getUserSubscriptions: {
      path: '/v1/account/profile',
      method: 'GET',
      validate: {
        query: {
          client_id: Joi.string().required(),
          uid: Joi.string().required(),
        },
        response: {
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

    async getUserSubscriptions({ client_id, uid }) {
      try {
        return await api.getUserSubscriptions({
          client_id,
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
