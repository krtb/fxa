/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const isA = require('joi');
const error = require('../error');
const validators = require('../routes/validators');
const createBackendServiceAPI = require('../backendService');
const { buildStubAPI } = require('./stubAPI');
const P = require('../promise');

/*
 * The subscriptions backend is called 'SubHub', a service managed outside the
 * FxA team to abstract away some details of payments processing.
 *
 * This library implements a little proxy in front of the SubHub API, allowing
 * it to be authenticated by FxA's bearer token.
 */

// String identifying originating system for subhub
const ORIGIN_SYSTEM = 'fxa';

// Common prefix for all API URL paths
const PATH_PREFIX = '/v1/sub';

const ErrorValidator = isA.object({
  message: isA.string().required(),
});

const MessageValidator = isA.object({
  message: isA.string().required(),
});

module.exports = function(log, config, statsd) {
  if (config.subhub.useStubs) {
    // TODO: Remove this someday after subhub is available
    return buildStubAPI(log, config);
  }

  if (!config.subhub.enabled) {
    return [
      'listPlans',
      'listSubscriptions',
      'createSubscription',
      'getCustomer',
      'updateCustomer',
      'deleteCustomer',
      'cancelSubscription',
      'reactivateSubscription',
    ].reduce(
      (obj, name) => ({
        ...obj,
        [name]: () => Promise.reject(error.featureNotEnabled()),
      }),
      {}
    );
  }

  const SubHubAPI = createBackendServiceAPI(
    log,
    config,
    'subhub',
    {
      listPlans: {
        path: `${PATH_PREFIX}/plans`,
        method: 'GET',
        validate: {
          response: isA.alternatives(
            isA.array().items(validators.subscriptionsPlanValidator),
            ErrorValidator
          ),
        },
      },

      listSubscriptions: {
        path: `${PATH_PREFIX}/customer/:uid/subscriptions`,
        method: 'GET',
        validate: {
          params: {
            uid: isA.string().required(),
          },
          response: isA.alternatives(
            validators.subscriptionsSubscriptionListValidator,
            ErrorValidator
          ),
        },
      },

      getCustomer: {
        path: `${PATH_PREFIX}/customer/:uid`,
        method: 'GET',
        validate: {
          params: {
            uid: isA.string().required(),
          },
          response: isA.alternatives(
            validators.subscriptionsCustomerValidator,
            ErrorValidator
          ),
        },
      },

      updateCustomer: {
        path: `${PATH_PREFIX}/customer/:uid`,
        method: 'POST',
        validate: {
          params: {
            uid: isA.string().required(),
          },
          payload: {
            pmt_token: isA.string().required(),
          },
          response: isA.alternatives(
            validators.subscriptionsCustomerValidator,
            ErrorValidator
          ),
        },
      },

      deleteCustomer: {
        path: `${PATH_PREFIX}/customer/:uid`,
        method: 'DELETE',
        validate: {
          params: {
            uid: isA.string().required(),
          },
          response: isA.alternatives(MessageValidator, ErrorValidator),
        },
      },

      createSubscription: {
        path: `${PATH_PREFIX}/customer/:uid/subscriptions`,
        method: 'POST',
        validate: {
          params: {
            uid: isA.string().required(),
          },
          payload: {
            pmt_token: isA.string().required(),
            plan_id: isA.string().required(),
            email: isA.string().required(),
            origin_system: isA.string().required(),
            display_name: isA.string().required(),
          },
          response: isA.alternatives(
            validators.subscriptionsSubscriptionListValidator,
            ErrorValidator
          ),
        },
      },

      cancelSubscription: {
        path: `${PATH_PREFIX}/customer/:uid/subscriptions/:sub_id`,
        method: 'DELETE',
        validate: {
          params: {
            uid: isA.string().required(),
            sub_id: isA.string().required(),
          },
          response: isA.alternatives(MessageValidator, ErrorValidator),
        },
      },

      reactivateSubscription: {
        path: `${PATH_PREFIX}/customer/:uid/subscriptions/:sub_id`,
        method: 'POST',
        validate: {
          params: {
            uid: isA.string().required(),
            sub_id: isA.string().required(),
          },
          response: isA.alternatives(MessageValidator, ErrorValidator),
        },
      },
    },
    statsd
  );

  const plansCacheTtlSeconds = config.subhub.plansCacheTtlSeconds;
  const redis =
    plansCacheTtlSeconds &&
    require('../redis')(
      {
        ...config.redis,
        ...config.redis.subhub,
      },
      log
    );
  const plansCacheIsEnabled = plansCacheTtlSeconds && redis;

  const api = new SubHubAPI(config.subhub.url, {
    headers: {
      Authorization: config.subhub.key,
    },
    timeout: 15000,
  });

  return {
    isStubAPI: false,

    async close() {
      const promises = [api.close()];
      if (redis) {
        promises.push(redis.close());
      }
      return await P.all(promises);
    },

    async listPlans() {
      const cacheKey = 'listPlans';

      if (plansCacheIsEnabled) {
        try {
          const json = await redis.get(cacheKey);
          if (json) {
            return JSON.parse(json);
          }
        } catch (err) {
          log.error('subhub.listPlans.getCachedResponse.failed', { err });
        }
      }

      const plans = await api.listPlans();

      if (plansCacheIsEnabled) {
        redis
          .set(cacheKey, JSON.stringify(plans), 'EX', plansCacheTtlSeconds)
          .catch(err =>
            log.error('subhub.listPlans.cacheResponse.failed', { err })
          );
      }

      return plans;
    },

    async listSubscriptions(uid) {
      try {
        return await api.listSubscriptions(uid);
      } catch (err) {
        if (err.statusCode === 404) {
          log.error('subhub.listSubscriptions.1', { uid, err });
          throw error.unknownCustomer(uid);
        }
        if (err.statusCode === 403) {
          return { subscriptions: [] };
        }
        throw err;
      }
    },

    async createSubscription(uid, pmt_token, plan_id, display_name, email) {
      try {
        return await api.createSubscription(uid, {
          pmt_token,
          plan_id,
          display_name,
          email,
          origin_system: ORIGIN_SYSTEM,
        });
      } catch (err) {
        if (
          err.statusCode === 400 ||
          err.statusCode === 402 ||
          err.statusCode === 404
        ) {
          log.error('subhub.createSubscription.1', {
            uid,
            pmt_token,
            plan_id,
            display_name,
            email,
            err,
          });
          if (err.statusCode === 404) {
            throw error.unknownSubscriptionPlan(plan_id);
          }
          if (err.statusCode === 400 || err.statusCode === 402) {
            throw error.rejectedSubscriptionPaymentToken(err.message, err);
          }
        }
        throw err;
      }
    },

    async cancelSubscription(uid, sub_id) {
      try {
        return await api.cancelSubscription(uid, sub_id);
      } catch (err) {
        if (err.statusCode === 400 || err.statusCode === 404) {
          log.error('subhub.cancelSubscription.1', { uid, sub_id, err });
          // TODO: update with subhub cancelSubscription error response for invalid uid
          if (err.message === 'invalid uid') {
            throw error.unknownCustomer(uid);
          }
          // TODO: update with subhub cancelSubscription error response for invalid plan ID
          if (err.message === 'invalid subscription id') {
            throw error.unknownSubscription(sub_id);
          }
        }
        throw err;
      }
    },

    async reactivateSubscription(uid, sub_id) {
      try {
        return await api.reactivateSubscription(uid, sub_id);
      } catch (err) {
        log.error('subhub.reactivateSubscription.1', { uid, sub_id, err });

        if (err.statusCode === 404) {
          if (err.message === 'invalid uid') {
            throw error.unknownCustomer(uid);
          }

          if (err.message === 'invalid subscription id') {
            throw error.unknownSubscription(sub_id);
          }
        }

        throw err;
      }
    },

    async getCustomer(uid) {
      try {
        return await api.getCustomer(uid);
      } catch (err) {
        if (err.statusCode === 404) {
          log.error('subhub.getCustomer.1', { uid, err });
          throw error.unknownCustomer(uid);
        }
        throw err;
      }
    },

    async updateCustomer(uid, pmt_token) {
      try {
        return await api.updateCustomer(uid, { pmt_token });
      } catch (err) {
        if (
          err.statusCode === 400 ||
          err.statusCode === 402 ||
          err.statusCode === 404
        ) {
          log.error('subhub.updateCustomer.1', { uid, pmt_token, err });
          if (err.statusCode === 404) {
            throw error.unknownCustomer(uid);
          }
          if (err.statusCode === 400 || err.statusCode === 402) {
            throw error.rejectedCustomerUpdate(err.message, err);
          }
        }
        throw err;
      }
    },

    async deleteCustomer(uid) {
      try {
        return await api.deleteCustomer(uid);
      } catch (err) {
        if (err.statusCode === 404) {
          // This method is called optimistically, so swallow `unknownCustomer` errors.
          return { message: 'unknown customer' };
        }

        log.error('subhub.deleteCustomer.failed', { uid, err });

        throw err;
      }
    },
  };
};
