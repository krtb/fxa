import React from 'react';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import nock from 'nock';
import waitForExpect from 'wait-for-expect';

import { AuthServerErrno } from '../../lib/errors';

import { QueryParams } from '../../lib/types';
import { createAppStore, actions } from '../../store';
import { Store } from '../../store/types';

import { PAYMENT_ERROR_1 } from '../../lib/errors';
import {
  wait,
  defaultAppContextValue,
  MockApp,
  setupMockConfig,
  mockConfig,
  mockServerUrl,
  mockOptionsResponses,
  mockStripeElementOnChangeFns,
  elementChangeResponse,
  STRIPE_FIELDS,
  VALID_CREATE_TOKEN_RESPONSE,
  MOCK_PROFILE,
  MOCK_PLANS,
  MOCK_ACTIVE_SUBSCRIPTIONS,
  MOCK_CUSTOMER,
  MOCK_ACTIVE_SUBSCRIPTIONS_AFTER_SUBSCRIPTION,
  MOCK_CUSTOMER_AFTER_SUBSCRIPTION,
} from '../../lib/test-utils';

import { SettingsLayout } from '../../components/AppLayout';
import Subscriptions from './index';

describe('routes/Subscriptions', () => {
  let contentServer = '';
  let authServer = '';
  let profileServer = '';

  beforeEach(() => {
    setupMockConfig(mockConfig);
    contentServer = mockServerUrl('content');
    authServer = mockServerUrl('auth');
    mockOptionsResponses(authServer);
    profileServer = mockServerUrl('profile');
    mockOptionsResponses(profileServer);
  });

  afterEach(() => {
    nock.cleanAll();
    return cleanup();
  });

  const Subject = ({
    store,
    queryParams = {},
    matchMedia = jest.fn(() =>false),
    navigateToUrl = jest.fn(),
    createToken = jest.fn().mockResolvedValue(VALID_CREATE_TOKEN_RESPONSE),
  }: {
    store?: Store;
    queryParams?: QueryParams;
    matchMedia?: (query: string) => boolean;
    navigateToUrl?: (url: string) => void;
    createToken?: jest.Mock<any, any>;
  }) => {
    const props = {};
    const mockStripe = {
      createToken,
    };
    const appContextValue = {
      ...defaultAppContextValue(),
      matchMedia: matchMedia || jest.fn(() => { return { matches: false } }),
      navigateToUrl: navigateToUrl || jest.fn(),
      queryParams,
    };
    return (
      <MockApp {...{ mockStripe, appContextValue, store }}>
        <SettingsLayout>
          <Subscriptions {...props} />
        </SettingsLayout>
      </MockApp>
    );
  };

  const initApiMocks = ({
    displayName = undefined,
    mockCustomer = MOCK_CUSTOMER,
    mockActiveSubscriptions = MOCK_ACTIVE_SUBSCRIPTIONS,
  }: {
    displayName?: string | undefined,
    mockCustomer?: typeof MOCK_CUSTOMER,
    mockActiveSubscriptions?: typeof MOCK_ACTIVE_SUBSCRIPTIONS
  } = {}) => [
    nock(profileServer)
      .get('/v1/profile')
      .reply(200, { ...MOCK_PROFILE, displayName }),
    nock(authServer)
      .get('/v1/oauth/subscriptions/plans')
      .reply(200, MOCK_PLANS),
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, mockActiveSubscriptions),
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(200, mockCustomer),
  ];

  it('lists all subscriptions', async () => {
    // Use mocks for subscription lists that exercise multiple plans
    initApiMocks({
      mockCustomer: MOCK_CUSTOMER_AFTER_SUBSCRIPTION,
      mockActiveSubscriptions: MOCK_ACTIVE_SUBSCRIPTIONS_AFTER_SUBSCRIPTION,
    });
    const { findByTestId, queryAllByTestId, queryByTestId } = render(
      <Subject />
    );
    await findByTestId('subscription-management-loaded');
    const items = queryAllByTestId('subscription-item');
    expect(items.length).toBe(2);
    expect(queryByTestId('no-subscriptions-available')).not.toBeInTheDocument();
  });

  it('offers a button for support', async () => {
    initApiMocks();
    const navigateToUrl = jest.fn();
    const matchMedia = jest.fn(() => { return { matches: false } });
    const { getByTestId, findByTestId, findByText } = render(<Subject matchMedia={matchMedia} navigateToUrl={navigateToUrl} />);
    await findByTestId('subscription-management-loaded');
    fireEvent.click(getByTestId('contact-support-button'));
    await waitForExpect(() => expect(navigateToUrl).toBeCalled());
    expect(navigateToUrl).toBeCalledWith(`${contentServer}/support`);
  });

  it('displays profile displayName if available', async () => {
    initApiMocks({displayName: 'Foo Barson'});
    const { findByText } = render(<Subject />);
    await findByText('Foo Barson');
  });

  it('displays a message if no subscriptions are available', async () => {
    const apiMocks = [
      nock(profileServer)
        .get('/v1/profile')
        .reply(200, MOCK_PROFILE),
      nock(authServer)
        .get('/v1/oauth/subscriptions/plans')
        .reply(200, MOCK_PLANS),
      nock(authServer)
        .get('/v1/oauth/subscriptions/active')
        .reply(200, []),
      nock(authServer)
        .get('/v1/oauth/subscriptions/customer')
        .reply(200, {
          ...MOCK_CUSTOMER,
          subscriptions: [],
        }),
    ];
    const { findByTestId, queryAllByTestId, queryByTestId } = render(
      <Subject />
    );
    await findByTestId('subscription-management-loaded');
    const items = queryAllByTestId('subscription-item');
    expect(items.length).toBe(0);
    expect(queryByTestId('no-subscriptions-available')).toBeInTheDocument();
  });

  it('displays an error if profile fetch fails', async () => {
    nock(profileServer)
      .get('/v1/profile')
      .reply(500, MOCK_PROFILE);
    nock(authServer)
      .get('/v1/oauth/subscriptions/plans')
      .reply(200, MOCK_PLANS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(500, MOCK_ACTIVE_SUBSCRIPTIONS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(403, MOCK_CUSTOMER);
    const { findByTestId } = render(<Subject />);
    await findByTestId('error-profile-fetch');
  });

  it('displays an error if plans fetch fails', async () => {
    nock(profileServer)
      .get('/v1/profile')
      .reply(200, MOCK_PROFILE);
    nock(authServer)
      .get('/v1/oauth/subscriptions/plans')
      .reply(500, MOCK_PLANS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(500, MOCK_ACTIVE_SUBSCRIPTIONS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(403, MOCK_CUSTOMER);
    const { findByTestId } = render(<Subject />);
    await findByTestId('error-plans-fetch');
  });

  it('displays an error if subscriptions fetch fails', async () => {
    nock(profileServer)
      .get('/v1/profile')
      .reply(200, MOCK_PROFILE);
    nock(authServer)
      .get('/v1/oauth/subscriptions/plans')
      .reply(200, MOCK_PLANS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(500, {});
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(403, MOCK_CUSTOMER);
    const { findByTestId } = render(<Subject />);
    await findByTestId('error-subscriptions-fetch');
  });

  it('displays an error if customer fetch fails', async () => {
    nock(profileServer)
      .get('/v1/profile')
      .reply(200, MOCK_PROFILE);
    nock(authServer)
      .get('/v1/oauth/subscriptions/plans')
      .reply(200, MOCK_PLANS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, MOCK_ACTIVE_SUBSCRIPTIONS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(403, {});
    const { findByTestId } = render(<Subject />);
    await findByTestId('error-customer-fetch');
  });

  it('does not display an error if customer fetch fails with 404', async () => {
    nock(profileServer)
      .get('/v1/profile')
      .reply(200, MOCK_PROFILE);
    nock(authServer)
      .get('/v1/oauth/subscriptions/plans')
      .reply(200, MOCK_PLANS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, MOCK_ACTIVE_SUBSCRIPTIONS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(404, {
        errno: AuthServerErrno.UNKNOWN_SUBSCRIPTION_CUSTOMER,
      });
    const { findByTestId, queryByTestId, debug } = render(<Subject />);
    await findByTestId('subscription-management-loaded');
    expect(queryByTestId('error-customer-fetch')).not.toBeInTheDocument();
    expect(queryByTestId('no-subscriptions-available')).toBeInTheDocument();
  });

  it('supports cancelling a subscription', async () => {
    initApiMocks();

    nock(authServer)
      .delete('/v1/oauth/subscriptions/active/sub0.28964929339372136')
      .reply(200, {});
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, [
        {
          uid: 'a90fef48240b49b2b6a33d333aee9b13',
          subscriptionId: 'sub0.28964929339372136',
          productId: '123doneProProduct',
          createdAt: 1565816388815,
          cancelledAt: 1566252991684,
        },
      ]);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(200, {
        ...MOCK_CUSTOMER,
        subscriptions: [
          {
            subscription_id: 'sub0.28964929339372136',
            plan_id: '123doneProMonthly',
            plan_name: '123done Pro Monthly',
            status: 'active',
            cancel_at_period_end: true,
            current_period_start: 1565816388.815,
            current_period_end: 1568408388.815,
          },
        ],
      });

    const { findByTestId, queryAllByTestId, getByTestId } = render(
      <Subject />
    );

    // Wait for the page to load with one subscription
    await findByTestId('subscription-management-loaded');
    const items = queryAllByTestId('subscription-item');
    expect(items.length).toBe(1);

    // Click the button to reveal the cancellation panel
    fireEvent.click(getByTestId('reveal-cancel-subscription-button'));
    await findByTestId('cancel-subscription-button');

    // Click the confirmation checkbox, wait for the button to be enabled
    const cancelButton = getByTestId('cancel-subscription-button');
    fireEvent.click(getByTestId('confirm-cancel-subscription-checkbox'));
    await waitForExpect(() =>
      expect(cancelButton).not.toHaveAttribute('disabled')
    );

    // Click the cancellation button
    fireEvent.click(cancelButton);

    // A farewell dialog should appear
    await findByTestId('cancellation-message-title');
  });

  async function commonReactivationSetup() {
    nock(profileServer)
      .get('/v1/profile')
      .reply(200, MOCK_PROFILE),
      nock(authServer)
        .get('/v1/oauth/subscriptions/plans')
        .reply(200, MOCK_PLANS),
      nock(authServer)
        .get('/v1/oauth/subscriptions/active')
        .reply(200, [
          {
            uid: 'a90fef48240b49b2b6a33d333aee9b13',
            subscriptionId: 'sub0.28964929339372136',
            productId: '123doneProProduct',
            createdAt: 1565816388815,
            cancelledAt: 1566252991684,
          },
        ]);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(200, {
        ...MOCK_CUSTOMER,
        subscriptions: [
          {
            subscription_id: 'sub0.28964929339372136',
            plan_id: '123doneProMonthly',
            plan_name: '123done Pro Monthly',
            status: 'active',
            cancel_at_period_end: true,
            current_period_start: 1565816388.815,
            current_period_end: 1568408388.815,
          },
        ],
      });
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, [
        {
          uid: 'a90fef48240b49b2b6a33d333aee9b13',
          subscriptionId: 'sub0.28964929339372136',
          productId: '123doneProProduct',
          createdAt: 1565816388815,
          cancelledAt: null,
        },
      ]);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(200, {
        ...MOCK_CUSTOMER,
        subscriptions: [
          {
            subscription_id: 'sub0.28964929339372136',
            plan_id: '123doneProMonthly',
            plan_name: '123done Pro Monthly',
            status: 'active',
            cancel_at_period_end: false,
            current_period_start: 1565816388.815,
            current_period_end: 1568408388.815,
          },
        ],
      });
  }

  it('supports reactivating a subscription', async () => {
    commonReactivationSetup();
    nock(authServer)
      .post('/v1/oauth/subscriptions/reactivate')
      .reply(200, {});

    const { findByTestId, getByTestId } = render(<Subject />);

    // Wait for the page to load with one subscription
    await findByTestId('subscription-management-loaded');

    const reactivateButton = getByTestId('reactivate-subscription-button');
    fireEvent.click(reactivateButton);

    await findByTestId('reveal-cancel-subscription-button');
  });

  it('should display an error message if reactivation fails', async () => {
    commonReactivationSetup();
    nock(authServer)
      .post('/v1/oauth/subscriptions/reactivate')
      .reply(500, {});

    const { debug, findByTestId, getByTestId } = render(<Subject />);

    // Wait for the page to load with one subscription
    await findByTestId('subscription-management-loaded');

    const reactivateButton = getByTestId('reactivate-subscription-button');
    fireEvent.click(reactivateButton);

    await findByTestId('error-reactivation');
  });

  it('should display an error message if subhub reports a subscription not found in auth-server', async () => {
    nock(profileServer)
      .get('/v1/profile')
      .reply(200, MOCK_PROFILE);
    nock(authServer)
      .get('/v1/oauth/subscriptions/plans')
      .reply(200, MOCK_PLANS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, []);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(200, MOCK_CUSTOMER);
    const { findByTestId } = render(<Subject />);
    await findByTestId('error-fxa-missing-subscription');
  });

  it('should display an error message for a plan found in auth-server but not subhub', async () => {
    nock(profileServer)
      .get('/v1/profile')
      .reply(200, MOCK_PROFILE);
    nock(authServer)
      .get('/v1/oauth/subscriptions/plans')
      .reply(200, []);
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, MOCK_ACTIVE_SUBSCRIPTIONS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(200, MOCK_CUSTOMER);
    const { findByTestId } = render(<Subject />);
    await findByTestId('error-subhub-missing-plan');
  });

  it('support updating billing information', async () => {
    initApiMocks();

    nock(authServer)
      .post('/v1/oauth/subscriptions/updatePayment')
      .reply(200, {});
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, MOCK_ACTIVE_SUBSCRIPTIONS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(200, MOCK_CUSTOMER);

    const createToken = jest
      .fn()
      .mockResolvedValue(VALID_CREATE_TOKEN_RESPONSE);
    const { findByTestId, getByTestId } = render(
      <Subject createToken={createToken} />
    );
    await findByTestId('subscription-management-loaded');

    // Click button to reveal the payment update form
    fireEvent.click(getByTestId('reveal-payment-update-button'));
    await findByTestId('paymentForm');

    act(() => {
      for (const testid of STRIPE_FIELDS) {
        mockStripeElementOnChangeFns[testid](
          elementChangeResponse({ complete: true, value: 'test' })
        );
      }
    });
    fireEvent.change(getByTestId('name'), { target: { value: 'Foo Barson' } });
    fireEvent.change(getByTestId('zip'), { target: { value: '90210' } });
    fireEvent.click(getByTestId('submit'));

    await findByTestId('success-billing-update');

    // click outside the payment success dialog to trigger dismiss
    fireEvent.click(getByTestId('clear-success-alert'));
    waitForExpect(() =>
      expect(getByTestId('success-billing-update')).not.toBeInTheDocument()
    );
  });

  it('displays an error message if updating billing information fails', async () => {
    initApiMocks();

    nock(authServer)
      .post('/v1/oauth/subscriptions/updatePayment')
      .reply(500, {});
    nock(authServer)
      .get('/v1/oauth/subscriptions/active')
      .reply(200, MOCK_ACTIVE_SUBSCRIPTIONS);
    nock(authServer)
      .get('/v1/oauth/subscriptions/customer')
      .reply(200, MOCK_CUSTOMER);

    const createToken = jest
      .fn()
      .mockResolvedValue(VALID_CREATE_TOKEN_RESPONSE);
    const {
      debug,
      findByTestId,
      getByTestId,
      queryAllByTestId,
      queryByTestId,
    } = render(<Subject createToken={createToken} />);
    await findByTestId('subscription-management-loaded');

    // Click button to reveal the payment update form
    fireEvent.click(getByTestId('reveal-payment-update-button'));
    await findByTestId('paymentForm');

    act(() => {
      for (const testid of STRIPE_FIELDS) {
        mockStripeElementOnChangeFns[testid](
          elementChangeResponse({ complete: true, value: 'test' })
        );
      }
    });
    fireEvent.change(getByTestId('name'), { target: { value: 'Foo Barson' } });
    fireEvent.change(getByTestId('zip'), { target: { value: '90210' } });
    fireEvent.click(getByTestId('submit'));

    await findByTestId('error-billing-update');
  });

  it('displays an error message if createToken resolves to an unexpected value', async () => {
    initApiMocks();

    const createToken = jest.fn().mockResolvedValue({ foo: 'bad value' });
    const {
      debug,
      findByTestId,
      getByTestId,
      queryAllByTestId,
      queryByTestId,
    } = render(<Subject createToken={createToken} />);
    await findByTestId('subscription-management-loaded');

    // Click button to reveal the payment update form
    fireEvent.click(getByTestId('reveal-payment-update-button'));
    await findByTestId('paymentForm');

    act(() => {
      for (const testid of STRIPE_FIELDS) {
        mockStripeElementOnChangeFns[testid](
          elementChangeResponse({ complete: true, value: 'test' })
        );
      }
    });
    fireEvent.change(getByTestId('name'), { target: { value: 'Foo Barson' } });
    fireEvent.change(getByTestId('zip'), { target: { value: '90210' } });
    fireEvent.click(getByTestId('submit'));

    await findByTestId('error-payment-submission');
  });

  it('displays an error message if createToken fails', async () => {
    initApiMocks();

    const createToken = jest.fn().mockRejectedValue({
      type: 'try_again_later',
    });

    const { container, findByTestId, getByTestId, queryByText } = render(
      <Subject createToken={createToken} />
    );
    await findByTestId('subscription-management-loaded');

    // Click button to reveal the payment update form
    fireEvent.click(getByTestId('reveal-payment-update-button'));
    await findByTestId('paymentForm');

    act(() => {
      for (const testid of STRIPE_FIELDS) {
        mockStripeElementOnChangeFns[testid](
          elementChangeResponse({ complete: true, value: 'test' })
        );
      }
    });
    fireEvent.change(getByTestId('name'), { target: { value: 'Foo Barson' } });
    fireEvent.change(getByTestId('zip'), { target: { value: '90210' } });
    fireEvent.click(getByTestId('submit'));

    await findByTestId('error-payment-submission');
    expect(queryByText(PAYMENT_ERROR_1)).toBeInTheDocument();

    // click outside the payment error dialog to trigger dismiss
    fireEvent.click(container);
    waitForExpect(() =>
      expect(getByTestId('error-payment-submission')).not.toBeInTheDocument()
    );
  });
});
