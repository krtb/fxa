/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A model to represent current subscription state, so that metrics can
 * associate events with products and plans.
 *
 * Tries to read data from the URL or, failing that, the resume token.
 */

import Backbone from 'backbone';
import Cocktail from 'cocktail';
import ResumeTokenMixin from './mixins/resume-token';
import UrlMixin from './mixins/url';
import Url from '../lib/url';

const SubscriptionModel = Backbone.Model.extend({
  initialize(options) {
    options = options || {};

    if (options.planId && options.productId) {
      this.set('planId', options.planId);
      this.set('productId', options.productId);
      return;
    }

    const win = options.window || window;
    const params = Url.searchParams(win.location.search);

    if (params.plan_id) {
      this.set('planId', params.plan_id);
      this.set('productId', win.pathname.split('/').pop());
      return;
    }

    this.populateFromStringifiedResumeToken(this.getSearchParam('resume'));
  },

  defaults: {
    planId: null,
    productId: null,
  },

  resumeTokenFields: ['planId', 'productId'],
});

Cocktail.mixin(SubscriptionModel, ResumeTokenMixin, UrlMixin);

export default SubscriptionModel;
