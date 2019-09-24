import React from 'react';
import { QueryParams } from './types';
import ScreenInfo from './screen-info';

export type AppContextType = {
  apiClient: any,
  queryParams: QueryParams;
  matchMedia: (query: string) => boolean;
  navigateToUrl: (url: string) => void;
  getScreenInfo: () => ScreenInfo;
  locationReload: (url: string) => void;
};

/* istanbul ignore next - this function does nothing worth covering */
const noopFunction = () => {};

export const defaultAppContext = {
  apiClient: {},
  getScreenInfo: () => new ScreenInfo(),
  locationReload: noopFunction,
  matchMedia: () => false,
  navigateToUrl: noopFunction,
  queryParams: {},
};

export const AppContext = React.createContext<AppContextType>(
  defaultAppContext
);

export default AppContext;
