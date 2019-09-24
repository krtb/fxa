import React, { ReactNode, useEffect, useContext } from 'react';
import { AppContext } from '../../lib/AppContext';

import './index.scss';

export type AppLayoutProps = {
  children: ReactNode;
};

export const AppLayout = ({ children }: AppLayoutProps) => {
  const { config } = useContext(AppContext).apiClient;

  return <>
    <div id="stage" data-testid="stage" className="fade-in-forward" style={{ opacity: 1 }}>
      {children}
    </div>
    <footer data-testid="footer">
      <div id="about-moz-footer" data-testid="about-moz-footer">
        <a
          id="about-mozilla"
          rel="author noopener noreferrer"
          target="_blank"
          href="https://www.mozilla.org/about/?utm_source=firefox-accounts&amp;utm_medium=Referral"
        >
          &nbsp;
        </a>
      </div>
      <div id="legal-footer" data-testid="legal-footer">
        <a className="terms"
          rel="noopener noreferrer"
          target="_blank"
          href={`${config.servers.content.url}/legal/terms`}>
          Terms of Service
        </a>
        <a className="privacy"
          rel="noopener noreferrer"
          target="_blank"
          href={`${config.servers.content.url}/legal/privacy`}>
          Privacy Notice
        </a>
      </div>
    </footer>
  </>;
};

export type SignInLayout = {
  children: ReactNode;
};

export const SignInLayout = ({ children }: SignInLayout) => (
  <>
    <AppLayout>
      <div className="sign-in">
        <div id="main-content" className="card payments-card">
          {children}
        </div>
      </div>
    </AppLayout>
  </>
);

export type SettingsLayout = {
  children: ReactNode;
};

export const SettingsLayout = ({ children }: SettingsLayout) => {
  useEffect(() => {
    document.body.classList.add('settings');
    return () => document.body.classList.remove('settings');
  }, [children]);

  const { config } = useContext(AppContext).apiClient;
  const homeURL = `${config.servers.content.url}/settings`;
  let breadcrumbs = (
    <ol className="breadcrumbs" data-testid="breadcrumbs">
      <li>
        <a href={homeURL}>Account Home</a>
      </li>
      <li>
        <a href="/subscriptions">Subscriptions</a>
      </li>
    </ol>
  );

  return (
    <AppLayout>
      <div className="settings">
        <div id="fxa-settings-header-wrapper">
          <header id="fxa-settings-header">
            <h1 id="fxa-manage-account">
              <span className="fxa-account-title">Firefox Accounts</span>
            </h1>
            {/*
              * TODO: We can't actually sign out of FxA from here. Maybe back to settings?
              <button id="signout" className="settings-button secondary-button">Sign out</button>
              */}
          </header>
          {breadcrumbs}
        </div>

        <div id="fxa-settings">
          <div id="fxa-settings-content" className="card">
            {children}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default AppLayout;
